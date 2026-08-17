import { NextRequest, NextResponse } from "next/server";
import { get, withTransaction } from "@/db/pool";
import { withApiErrors } from "@/lib/api-errors";
import { getPaymentProvider } from "@/lib/payments";

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

  await withTransaction(async (tx) => {
    await tx.get(
      `INSERT INTO webhook_events (provider, event_id, payload, processed_at) VALUES ('asaas', $1, $2, now())`,
      [eventId, rawBody]
    );

    const sub = await tx.get<{ id: number }>(
      `SELECT id FROM subscriptions WHERE provider_subscription_id = $1`,
      [event.providerSubscriptionId]
    );
    if (!sub) return; // assinatura desconhecida (ex: teste do painel Asaas) — só registra o evento

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
        await tx.get(`UPDATE subscriptions SET status = 'canceled', updated_at = now() WHERE id = $1`, [sub.id]);
        break;
      case "payment_chargeback":
        await tx.get(
          `INSERT INTO payments_history (subscription_id, provider_payment_id, amount, status)
           VALUES ($1, $2, 0, 'chargeback')`,
          [sub.id, event.providerPaymentId]
        );
        await tx.get(`UPDATE subscriptions SET status = 'canceled', updated_at = now() WHERE id = $1`, [sub.id]);
        break;
      case "subscription_canceled":
      case "subscription_expired":
        await tx.get(`UPDATE subscriptions SET status = 'expired', updated_at = now() WHERE id = $1`, [sub.id]);
        break;
    }
  });

  return NextResponse.json({ ok: true });
});
