export interface PaymentProvider {
  createCustomer(user: { id: number; name: string; email: string; cpfCnpj: string }): Promise<{ providerCustomerId: string }>;
  createSubscription(params: {
    providerCustomerId: string;
    planCode: string;
    value: number;
  }): Promise<{ providerSubscriptionId: string; checkoutUrl: string }>;
  cancelSubscription(providerSubscriptionId: string): Promise<void>;
  verifyWebhookSignature(req: Request, rawBody: string): boolean;
  parseWebhookEvent(rawBody: string): NormalizedEvent | null;
}

export type NormalizedEvent =
  | { type: "payment_approved"; providerSubscriptionId: string; providerPaymentId: string; amount: number; paidAt: string }
  | { type: "payment_failed"; providerSubscriptionId: string; providerPaymentId: string }
  | { type: "payment_refunded"; providerSubscriptionId: string; providerPaymentId: string }
  | { type: "payment_chargeback"; providerSubscriptionId: string; providerPaymentId: string }
  | { type: "subscription_canceled"; providerSubscriptionId: string }
  | { type: "subscription_expired"; providerSubscriptionId: string };
