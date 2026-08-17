import { NextRequest, NextResponse } from "next/server";
import { get, run } from "@/db/pool";
import { getSessionUser } from "@/lib/auth";
import { withApiErrors } from "@/lib/api-errors";
import { getPaymentProvider } from "@/lib/payments";

export const POST = withApiErrors("subscriptions.checkout.POST", async (req: NextRequest) => {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const force = body?.force === true;

  const sub = await get<{
    id: number;
    providerCustomerId: string | null;
    providerSubscriptionId: string | null;
    planCode: string;
    price: string;
    cpfCnpj: string | null;
  }>(
    `SELECT s.id, s.provider_customer_id as "providerCustomerId",
      s.provider_subscription_id as "providerSubscriptionId", p.code as "planCode", p.price,
      u.cpf_cnpj as "cpfCnpj"
     FROM subscriptions s JOIN plans p ON p.id = s.plan_id JOIN users u ON u.id = s.user_id
     WHERE s.user_id = $1 ORDER BY s.id DESC LIMIT 1`,
    [user.id]
  );
  if (!sub) return NextResponse.json({ error: "Nenhuma assinatura encontrada." }, { status: 404 });

  const provider = getPaymentProvider();

  // Já existe uma assinatura criada na Asaas esperando pagamento (ex: o
  // usuário fechou a página antes de pagar) — reaproveita a mesma fatura em
  // vez de criar uma nova a cada tentativa, a não ser que o usuário peça
  // explicitamente um link novo (force).
  if (sub.providerSubscriptionId && !force) {
    const existingUrl = await provider.getPendingCheckoutUrl(sub.providerSubscriptionId);
    if (existingUrl) return NextResponse.json({ checkoutUrl: existingUrl });
  }

  // Gerando um link novo de propósito com uma assinatura anterior ainda
  // aberta na Asaas — cancela a antiga primeiro pra não correr o risco de
  // cobrar as duas em paralelo caso a antiga seja paga depois.
  if (force && sub.providerSubscriptionId) {
    await provider.cancelSubscription(sub.providerSubscriptionId).catch(() => {});
  }

  let cpfCnpj = sub.cpfCnpj;
  if (!cpfCnpj) {
    const digits = typeof body?.cpfCnpj === "string" ? body.cpfCnpj.replace(/\D/g, "") : "";
    if (digits.length !== 11 && digits.length !== 14) {
      return NextResponse.json(
        { error: "Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.", code: "cpf_cnpj_required" },
        { status: 400 }
      );
    }
    cpfCnpj = digits;
    await run(`UPDATE users SET cpf_cnpj = $1 WHERE id = $2`, [cpfCnpj, user.id]);
  }
  if (!cpfCnpj) return NextResponse.json({ error: "Erro interno." }, { status: 500 });

  let providerCustomerId = sub.providerCustomerId;
  if (!providerCustomerId) {
    const customer = await provider.createCustomer({ id: user.id, name: user.email, email: user.email, cpfCnpj });
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
