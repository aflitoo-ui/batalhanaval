// Aceita tanto o `get` de fora de transação quanto o `tx.get` de dentro de
// uma — ambos têm a mesma assinatura.
type Getter = (sql: string, params?: unknown[]) => Promise<unknown>;

// Credita 1 convite pra quem foi liberado manualmente pelo admin, só na
// primeira vez — invite_credit_earned trava isso pra não creditar de novo a
// cada renovação/ajuste de acesso feito pelo admin.
export async function grantInviteCreditOnce(db: { get: Getter }, userId: number) {
  await db.get(
    `UPDATE users SET invite_credits = invite_credits + 1, invite_credit_earned = true
     WHERE id = $1 AND invite_credit_earned = false`,
    [userId]
  );
}

// Credita 1 convite a cada pagamento aprovado (mensalidade paga, inclusive
// renovação) — sem trava, diferente de grantInviteCreditOnce acima.
export async function grantInviteCreditForPayment(db: { get: Getter }, userId: number) {
  await db.get(`UPDATE users SET invite_credits = invite_credits + 1 WHERE id = $1`, [userId]);
}
