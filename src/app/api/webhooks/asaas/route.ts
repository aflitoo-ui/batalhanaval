import { NextRequest, NextResponse } from "next/server";
import { get, withTransaction } from "@/db/pool";
import { withApiErrors } from "@/lib/api-errors";
import { getPaymentProvider } from "@/lib/payments";
import { sendTelegramAlert } from "@/lib/telegram";
import { grantInviteCreditForPayment } from "@/lib/invites";

// Endpoint chamado pelo Asaas, nunca pelo navegador do usuário — a
// autenticação é o token de webhook (verifyWebhookSignature), não sessão.
export const POST = withApiErrors("webhooks.asaas.POST", async (req: NextRequest) => {
  const provider = getPaymentProvider();
  const rawBody = await req.text();

  if (!provider.verifyWebhookSignature(req, rawBody)) {
    return NextResponse.json({ error: "Assinatura inválida." }, { status: 401 });
  }

  const event = provider.parseWebhookEvent(rawBody);
  if (!event) {
    // Evento que não mapeamos (ex: PAYMENT_CREATED) — confirma recebido e ignora.
    return NextResponse.json({ ok: true });
  }

  const eventId =
    event.type === "subscription_canceled" || event.type === "subscription_expired"
      ? `${event.type}:${event.providerSubscriptionId}`
      : `${event.type}:${event.providerPaymentId}`;
  const existing = await get(`SELECT id FROM webhook_events WHERE provider = 'asaas' AND event_id = $1`, [eventId]);
  if (existing) {
    return NextResponse.json({ ok: true }); // já processado — gateway reenviou
  }

  // Captura o e-mail do usuário afetado (se a assinatura for conhecida) pra
  // poder mandar o alerta do Telegram depois que a transação confirmar —
  // uma chamada de API externa não tem por que fazer parte da transação
  // do banco.
  const alertTarget = await withTransaction(async (tx) => {
    await tx.get(
      `INSERT INTO webhook_events (provider, event_id, payload, processed_at) VALUES ('asaas', $1, $2, now())`,
      [eventId, rawBody]
    );

    const sub = await tx.get<{ id: number; userId: number; email: string }>(
      `SELECT s.id, s.user_id as "userId", u.email FROM subscriptions s
       JOIN users u ON u.id = s.user_id
       WHERE s.provider_subscription_id = $1`,
      [event.providerSubscriptionId]
    );
    if (!sub) return null; // assinatura desconhecida (ex: teste do painel Asaas) — só registra o evento

    switch (event.type) {
      case "payment_approved": {
        const nextPeriodEnd = new Date(event.paidAt);
        nextPeriodEnd.setDate(nextPeriodEnd.getDate() + 30);
        await tx.get(
          `UPDATE subscriptions SET status = 'active', current_period_end = $1, updated_at = now() WHERE id = $2`,
          [nextPeriodEnd.toISOString().slice(0, 10), sub.id]
        );
        await tx.get(
          `INSERT INTO payments_history (subscription_id, provider_payment_id, amount, status, paid_at)
           VALUES ($1, $2, $3, 'approved', $4)`,
          [sub.id, event.providerPaymentId, event.amount, event.paidAt]
        );
        // 1 convite a cada mensalidade paga (não só na primeira vez).
        await grantInviteCreditForPayment(tx, sub.userId);
        break;
      }
      case "payment_failed":
        await tx.get(`UPDATE subscriptions SET status = 'past_due', updated_at = now() WHERE id = $1`, [sub.id]);
        break;
      case "payment_refunded":
        await tx.get(
          `INSERT INTO payments_history (subscription_id, provider_payment_id, amount, status)
           VALUES ($1, $2, 0, 'refunded')`,
          [sub.id, event.providerPaymentId]
        );
        // Status próprio (não 'canceled') — o dinheiro já voltou pro
        // cliente, então o acesso é cortado na hora (ver getAccessStatus em
        // src/lib/subscription.ts), diferente do cancelamento voluntário,
        // que ainda respeita o período já pago. Sem canceled_at: essa coluna
        // é só pro cancelamento pelo próprio cliente.
        await tx.get(`UPDATE subscriptions SET status = 'refunded', updated_at = now() WHERE id = $1`, [sub.id]);
        break;
      case "payment_chargeback":
        await tx.get(
          `INSERT INTO payments_history (subscription_id, provider_payment_id, amount, status)
           VALUES ($1, $2, 0, 'chargeback')`,
          [sub.id, event.providerPaymentId]
        );
        // Mesma lógica do estorno (acesso cortado na hora), status próprio
        // porque chargeback costuma indicar disputa/fraude — mais grave que
        // um estorno normal, por isso o alerta extra no Telegram logo abaixo.
        await tx.get(`UPDATE subscriptions SET status = 'chargeback', updated_at = now() WHERE id = $1`, [sub.id]);
        break;
      case "subscription_canceled":
      case "subscription_expired":
        await tx.get(`UPDATE subscriptions SET status = 'expired', updated_at = now() WHERE id = $1`, [sub.id]);
        break;
    }

    return {
      type: event.type,
      email: sub.email,
      amount: event.type === "payment_approved" ? event.amount : undefined,
    };
  });

  // Fora da transação (já commitada) — uma chamada de API externa não tem
  // por que fazer parte da transação do banco.
  if (alertTarget) {
    const amountBRL = alertTarget.amount?.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    // "🔴 URGENTE" só nos dois casos que pedem ação/atenção rápida do admin
    // (risco de perder cliente ou possível fraude) — o resto é informativo,
    // pra não afogar o que realmente precisa de resposta no meio do ruído.
    const messages: Record<string, string> = {
      payment_approved: `✅ Pagamento aprovado: ${alertTarget.email} — ${amountBRL}`,
      payment_failed: `🔴 URGENTE — Pagamento falhou: ${alertTarget.email}`,
      payment_refunded: `💸 Pagamento estornado: ${alertTarget.email}`,
      payment_chargeback: `🔴 URGENTE — Chargeback em disputa, verifique a conta de ${alertTarget.email}.`,
      subscription_canceled: `❌ Assinatura cancelada: ${alertTarget.email}`,
      subscription_expired: `❌ Assinatura expirada: ${alertTarget.email}`,
    };
    const text = messages[alertTarget.type];
    if (text) await sendTelegramAlert(text);
  }

  return NextResponse.json({ ok: true });
});
