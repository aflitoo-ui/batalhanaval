import { NextResponse } from "next/server";
import { get, run } from "@/db/pool";
import { getSessionUser } from "@/lib/auth";
import { withApiErrors } from "@/lib/api-errors";
import { getPaymentProvider } from "@/lib/payments";
import { sendTelegramAlert } from "@/lib/telegram";

export const POST = withApiErrors("subscriptions.cancel.POST", async () => {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const sub = await get<{ id: number; providerSubscriptionId: string | null }>(
    `SELECT id, provider_subscription_id as "providerSubscriptionId" FROM subscriptions
     WHERE user_id = $1 ORDER BY id DESC LIMIT 1`,
    [user.id]
  );
  if (!sub) return NextResponse.json({ error: "Nenhuma assinatura encontrada." }, { status: 404 });

  if (sub.providerSubscriptionId) {
    await getPaymentProvider().cancelSubscription(sub.providerSubscriptionId);
  }

  // O acesso continua liberado até o fim do período já pago — getAccessStatus
  // decide isso comparando current_period_end, não o status por si só.
  await run(`UPDATE subscriptions SET status = 'canceled', canceled_at = now(), updated_at = now() WHERE id = $1`, [
    sub.id,
  ]);

  // Antes só cancelamento vindo do lado do Asaas (subscription_canceled)
  // avisava o admin — cancelamento pela própria conta ficava em silêncio.
  // Informativo, não urgente: o acesso segue normal até o fim do período.
  void sendTelegramAlert(`↩️ Cancelamento voluntário: ${user.email} — acesso segue até o fim do período pago.`);

  return NextResponse.json({ ok: true });
});
