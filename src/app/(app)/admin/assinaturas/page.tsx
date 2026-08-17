import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AssinaturasAdminClient } from "./AssinaturasAdminClient";

export default async function AdminAssinaturasPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");
  return <AssinaturasAdminClient />;
}
