import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import AppShell from "@/components/AppShell";

// Toda página dentro do grupo (app) exige login — sem sessão válida, vai
// direto pra /login. Checagem no servidor, sem "flash" de conteúdo protegido.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return <AppShell user={user}>{children}</AppShell>;
}
