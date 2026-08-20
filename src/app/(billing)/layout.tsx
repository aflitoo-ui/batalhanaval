import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";

// Grupo de rota separado do (app): exige login mas NUNCA assinatura ativa —
// é justamente aqui que quem está sem acesso vem pagar.
export default async function BillingLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return <div className="min-h-screen bg-zinc-950 pt-[env(safe-area-inset-top)] text-zinc-100">{children}</div>;
}
