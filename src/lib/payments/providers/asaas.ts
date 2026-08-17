import type { PaymentProvider, NormalizedEvent } from "../types";

// API da Asaas: https://docs.asaas.com/reference
// Sandbox: https://sandbox.asaas.com/api/v3 · Produção: https://www.asaas.com/api/v3
const BASE_URL = process.env.ASAAS_BASE_URL || "https://www.asaas.com/api/v3";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente ${name} não configurada.`);
  return value;
}

async function asaasFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      access_token: requiredEnv("ASAAS_API_KEY"),
      ...init.headers,
    },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message = data?.errors?.[0]?.description || `Erro na Asaas (${res.status})`;
    throw new Error(message);
  }
  return data;
}

// Eventos de pagamento da Asaas: PAYMENT_CONFIRMED/PAYMENT_RECEIVED (aprovado),
// PAYMENT_OVERDUE (venceu sem pagar), PAYMENT_REFUNDED (estornado),
// PAYMENT_CHARGEBACK_REQUESTED/PAYMENT_CHARGEBACK_DISPUTE (chargeback),
// PAYMENT_DELETED (cobrança removida, ex: assinatura cancelada).
const EVENT_MAP: Record<string, NormalizedEvent["type"] | undefined> = {
  PAYMENT_CONFIRMED: "payment_approved",
  PAYMENT_RECEIVED: "payment_approved",
  PAYMENT_OVERDUE: "payment_failed",
  PAYMENT_REFUNDED: "payment_refunded",
  PAYMENT_CHARGEBACK_REQUESTED: "payment_chargeback",
  PAYMENT_CHARGEBACK_DISPUTE: "payment_chargeback",
  PAYMENT_DELETED: "subscription_expired",
};

export const asaasProvider: PaymentProvider = {
  async createCustomer(user) {
    const data = await asaasFetch("/customers", {
      method: "POST",
      body: JSON.stringify({ name: user.name, email: user.email, externalReference: String(user.id) }),
    });
    return { providerCustomerId: data.id };
  },

  async createSubscription({ providerCustomerId, value }) {
    const nextDueDate = new Date();
    nextDueDate.setDate(nextDueDate.getDate() + 1);

    const subscription = await asaasFetch("/subscriptions", {
      method: "POST",
      body: JSON.stringify({
        customer: providerCustomerId,
        billingType: "UNDEFINED", // deixa o cliente escolher Pix/boleto/cartão na fatura
        cycle: "MONTHLY",
        value,
        nextDueDate: nextDueDate.toISOString().slice(0, 10),
        description: "Assinatura STRIX",
      }),
    });

    // A Asaas gera a primeira fatura (payment) automaticamente ao criar a
    // assinatura — buscamos ela pra pegar o link de pagamento hospedado.
    const payments = await asaasFetch(`/payments?subscription=${subscription.id}&limit=1`);
    const checkoutUrl = payments?.data?.[0]?.invoiceUrl;
    if (!checkoutUrl) throw new Error("Não foi possível gerar o link de pagamento.");

    return { providerSubscriptionId: subscription.id, checkoutUrl };
  },

  async cancelSubscription(providerSubscriptionId) {
    await asaasFetch(`/subscriptions/${providerSubscriptionId}`, { method: "DELETE" });
  },

  verifyWebhookSignature(req) {
    // A Asaas reenvia, em cada chamada de webhook, o token configurado no
    // painel ("Token de acesso") no header abaixo — comparamos com o nosso.
    const token = req.headers.get("asaas-access-token");
    return Boolean(token) && token === process.env.ASAAS_WEBHOOK_TOKEN;
  },

  parseWebhookEvent(rawBody) {
    const body = JSON.parse(rawBody);
    const type = EVENT_MAP[body.event as string];
    if (!type) return null;

    const payment = body.payment;
    if (!payment) return null;

    if (type === "payment_approved") {
      return {
        type,
        providerSubscriptionId: payment.subscription,
        providerPaymentId: payment.id,
        amount: payment.value,
        paidAt: payment.paymentDate || payment.clientPaymentDate || new Date().toISOString().slice(0, 10),
      };
    }
    return { type, providerSubscriptionId: payment.subscription, providerPaymentId: payment.id };
  },
};
