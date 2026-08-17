import type { PaymentProvider } from "./types";
import { asaasProvider } from "./providers/asaas";

export type { PaymentProvider, NormalizedEvent } from "./types";

const providers: Record<string, PaymentProvider> = {
  asaas: asaasProvider,
};

export function getPaymentProvider(): PaymentProvider {
  const name = process.env.PAYMENT_PROVIDER || "asaas";
  const provider = providers[name];
  if (!provider) throw new Error(`Gateway de pagamento "${name}" não configurado.`);
  return provider;
}
