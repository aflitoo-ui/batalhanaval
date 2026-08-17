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
  // explicitamente um link novo (force). Se o cliente/assinatura foi apagado
  // manualmente na Asaas nesse meio tempo, a busca falha — ignora e recria.
  if (sub.providerSubscriptionId && !force) {
    try {
      const existingUrl = await provider.getPendingCheckoutUrl(sub.providerSubscriptionId);
      if (existingUrl) return NextResponse.json({ checkoutUrl: existingUrl });
    } catch {
      // assinatura antiga não existe mais na Asaas — segue pra recriar abaixo
    }
  }

  // Gerando de propósito (force) ou recriando por já não existir mais na
  // Asaas: cancela a assinatura antiga (se ainda existir) pra não correr o
  // risco de cobrar duas em paralelo, e trata o cliente como apagado também
  // — pode ter sido removido manualmente junto com a assinatura.
  let providerCustomerId = sub.providerCustomerId;
  if (force && sub.providerSubscriptionId) {
    await provider.cancelSubscription(sub.providerSubscriptionId).catch(() => {});
    providerCustomerId = null;
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

  async function createFreshCustomer() {
    const customer = await provider.createCustomer({
      id: user!.id,
      name: user!.email,
      email: user!.email,
      cpfCnpj: cpfCnpj!,
    });
    return customer.providerCustomerId;
  }

  if (!providerCustomerId) {
    providerCustomerId = await createFreshCustomer();
  }

  let result;
  try {
    result = await provider.createSubscription({ providerCustomerId, planCode: sub.planCode, value: Number(sub.price) });
  } catch {
    // O cliente salvo também pode ter sido apagado manualmente na Asaas
    // (fora do fluxo de "force") — tenta uma vez mais com um cliente novo
    // antes de desistir de verdade.
    providerCustomerId = await createFreshCustomer();
    result = await provider.createSubscription({ providerCustomerId, planCode: sub.planCode, value: Number(sub.price) });
  }

  await run(
    `UPDATE subscriptions
     SET provider_customer_id = $1, provider_subscription_id = $2, status = 'pending', updated_at = now()
     WHERE id = $3`,
    [providerCustomerId, result.providerSubscriptionId, sub.id]
  );

  return NextResponse.json({ checkoutUrl: result.checkoutUrl });
});
