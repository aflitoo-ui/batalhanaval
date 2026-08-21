import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getAccessStatus } from "@/lib/subscription";
import AppShell from "@/components/AppShell";

// Toda página dentro do grupo (app) exige login — sem isso, vai pra /login.
// A assinatura em si NÃO bloqueia mais a navegação: com ela vencida, a
// pessoa continua entrando normalmente (barra de navegação completa) e cada
// página bloqueia só os próprios dados (ver checagem de 403/subscription_required
// em cada fetch). O banner de aviso no topo (via daysLeft/subscriptionStatus,
// passado pro AppShell) continua igual.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const access = await getAccessStatus(user);

  return (
    <AppShell user={user} daysLeft={access.daysLeft} subscriptionStatus={access.status}>
      {children}
    </AppShell>
  );
}
