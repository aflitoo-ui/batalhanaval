import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getAccessStatus } from "@/lib/subscription";
import AppShell from "@/components/AppShell";

// Toda página dentro do grupo (app) exige login E assinatura válida (ou
// trial em dia) — sem uma das duas, vai pra /login ou /assinatura. Checagem
// no servidor, nunca com base em algo que o navegador tenha "avisado".
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const access = await getAccessStatus(user);
  if (!access.allowed) redirect("/assinatura");

  return (
    <AppShell user={user} daysLeft={access.daysLeft} subscriptionStatus={access.status}>
      {children}
    </AppShell>
  );
}
