// Cor por status de assinatura — compartilhada entre Usuários e Assinaturas
// (admin), pra um mesmo status ter sempre a mesma cor em qualquer tela.
// "Tem acesso agora" em verde, "vai perder em breve ou precisa de ação" em
// âmbar, "sem acesso" em vermelho, resto neutro.
export const SUBSCRIPTION_TONE: Record<string, string> = {
  trialing: "bg-blue-950 text-blue-400",
  active: "bg-emerald-950 text-emerald-400",
  granted: "bg-emerald-950 text-emerald-400",
  pending: "bg-amber-950 text-amber-400",
  past_due: "bg-red-950 text-red-400",
  canceled: "bg-amber-950 text-amber-400",
  refunded: "bg-red-950 text-red-400",
  chargeback: "bg-red-950 text-red-400",
  expired: "bg-red-950 text-red-400",
  none: "bg-zinc-800 text-zinc-500",
};

export function subscriptionTone(status: string | null | undefined) {
  return (status && SUBSCRIPTION_TONE[status]) || "bg-zinc-800 text-zinc-500";
}
