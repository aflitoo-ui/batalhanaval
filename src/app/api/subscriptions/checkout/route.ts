import { NextResponse } from "next/server";
import { get, run } from "@/db/pool";
import { getSessionUser } from "@/lib/auth";
import { withApiErrors } from "@/lib/api-errors";
import { getPaymentProvider } from "@/lib/payments";

export const POST = withApiErrors("subscriptions.checkout.POST", async () => {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const sub = await get<{ id: number; providerCustomerId: string | null; planCode: string; price: string }>(
    `SELECT s.id, s.provider_customer_id as "providerCustomerId", p.code as "planCode", p.price
     FROM subscriptions s JOIN plans p ON p.id = s.plan_id
     WHERE s.user_id = $1 ORDER BY s.id DESC LIMIT 1`,
    [user.id]
  );
  if (!sub) return NextResponse.json({ error: "Nenhuma assinatura encontrada." }, { status: 404 });

  const provider = getPaymentProvider();

  let providerCustomerId = sub.providerCustomerId;
  if (!providerCustomerId) {
    const customer = await provider.createCustomer({ id: user.id, name: user.email, email: user.email });
    providerCustomerId = customer.providerCustomerId;
  }

  const { providerSubscriptionId, checkoutUrl } = await provider.createSubscription({
    providerCustomerId,
    planCode: sub.planCode,
    value: Number(sub.price),
  });

  await run(
    `UPDATE subscriptions
     SET provider_customer_id = $1, provider_subscription_id = $2, status = 'pending', updated_at = now()
     WHERE id = $3`,
    [providerCustomerId, providerSubscriptionId, sub.id]
  );

  return NextResponse.json({ checkoutUrl });
});
