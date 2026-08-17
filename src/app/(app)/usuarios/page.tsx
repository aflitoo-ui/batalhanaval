import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { UsuariosClient } from "./UsuariosClient";

export default async function UsuariosPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");
  return <UsuariosClient />;
}
