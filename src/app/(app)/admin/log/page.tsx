import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { LogAdminClient } from "./LogAdminClient";

export default async function AdminLogPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");
  return <LogAdminClient />;
}
