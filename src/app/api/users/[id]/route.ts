import { NextRequest, NextResponse } from "next/server";
import { get, run } from "@/db/pool";
import { getSessionUser, hashPassword } from "@/lib/auth";
import { withApiErrors } from "@/lib/api-errors";
import { logAdminAction } from "@/lib/adminLog";
import { updateUserSchema } from "@/lib/schemas";

export const PATCH = withApiErrors(
  "users.PATCH",
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    if (user.role !== "admin") return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

    const { id } = await ctx.params;
    if (Number(id) === user.id) {
      return NextResponse.json({ error: "Você não pode alterar a própria conta por aqui." }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    const parsed = updateUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "Dados inválidos." }, { status: 400 });
    }

    const fields: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (parsed.data.active !== undefined) {
      fields.push(`active = $${i++}`);
      params.push(parsed.data.active);
    }
    if (parsed.data.role !== undefined) {
      fields.push(`role = $${i++}`);
      params.push(parsed.data.role);
    }
    if (parsed.data.password !== undefined) {
      fields.push(`password_hash = $${i++}`);
      params.push(hashPassword(parsed.data.password));
    }
    if (fields.length === 0 && !parsed.data.telegramReset && !parsed.data.grantInviteCredits) {
      return NextResponse.json({ error: "Nada para atualizar." }, { status: 400 });
    }

    if (fields.length > 0) {
      params.push(id);
      const result = await run(`UPDATE users SET ${fields.join(", ")} WHERE id = $${i}`, params);
      if (result.rowCount === 0) {
        return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
      }
    }

    // Trocar o Telegram vinculado é intencionalmente só do admin (não
    // self-service) — desvincula (chat_id/código/dispensa) mas mantém
    // telegram_bonus_granted_at intacto, então um vínculo novo depois disso
    // não gera um segundo bônus de dias.
    if (parsed.data.telegramReset) {
      const result = await run(
        `UPDATE users SET telegram_chat_id = NULL, telegram_link_code = NULL, telegram_popup_dismissed = false WHERE id = $1`,
        [id]
      );
      if (result.rowCount === 0) {
        return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
      }
    }

    // O admin escolhe quantos créditos soma de uma vez (diferente do crédito
    // automático, que só acontece uma vez por conta em src/lib/invites.ts).
    if (parsed.data.grantInviteCredits) {
      const result = await run(`UPDATE users SET invite_credits = invite_credits + $1 WHERE id = $2`, [
        parsed.data.grantInviteCredits,
        id,
      ]);
      if (result.rowCount === 0) {
        return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
      }
    }

    // Senha trocada ou conta desativada: derruba qualquer sessão já aberta
    // desse usuário em vez de deixá-la valer até expirar sozinha.
    if (parsed.data.password !== undefined || parsed.data.active === false) {
      await run(`DELETE FROM sessions WHERE user_id = $1`, [id]);
    }

    // Uma única requisição pode mexer em mais de um campo (ex: reativar +
    // trocar senha) — loga uma linha por campo que de fato veio no corpo,
    // todas apontando pro mesmo alvo.
    const targetUserId = Number(id);
    if (parsed.data.active !== undefined) {
      await logAdminAction({
        adminId: user.id,
        action: parsed.data.active ? "reactivate_user" : "deactivate_user",
        targetUserId,
      });
    }
    if (parsed.data.role !== undefined) {
      await logAdminAction({
        adminId: user.id,
        action: "change_role",
        targetUserId,
        details: `novo papel: ${parsed.data.role}`,
      });
    }
    if (parsed.data.password !== undefined) {
      await logAdminAction({
        adminId: user.id,
        action: "reset_password",
        targetUserId,
      });
    }
    if (parsed.data.telegramReset) {
      await logAdminAction({
        adminId: user.id,
        action: "reset_telegram",
        targetUserId,
      });
    }
    if (parsed.data.grantInviteCredits) {
      await logAdminAction({
        adminId: user.id,
        action: "grant_invite_credit",
        targetUserId,
        details: `+${parsed.data.grantInviteCredits}`,
      });
    }

    return NextResponse.json({ ok: true });
  }
);

export const DELETE = withApiErrors(
  "users.DELETE",
  async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    if (user.role !== "admin") return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

    const { id } = await ctx.params;
    if (Number(id) === user.id) {
      return NextResponse.json({ error: "Você não pode excluir a própria conta." }, { status: 400 });
    }

    // Busca o e-mail antes de excluir — depois do DELETE a linha some, e o
    // log de auditoria (target_user_id ON DELETE SET NULL) precisa de um
    // jeito de continuar legível mesmo com o usuário já apagado.
    const target = await get<{ email: string }>(`SELECT email FROM users WHERE id = $1`, [id]);

    // Apaga em cascata produtos, vendas, assinatura e sessões desse usuário
    // (chaves estrangeiras com ON DELETE CASCADE) — ação irreversível.
    const result = await run(`DELETE FROM users WHERE id = $1`, [id]);
    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    }
    await logAdminAction({
      adminId: user.id,
      action: "delete_user",
      targetUserId: null,
      details: target?.email || `id ${id}`,
    });
    return NextResponse.json({ ok: true });
  }
);
