import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { ConvitesAdminClient } from "./ConvitesAdminClient";

export default async function AdminConvitesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");
  return <ConvitesAdminClient />;
}
