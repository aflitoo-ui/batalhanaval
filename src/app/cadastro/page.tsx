import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { SignupForm } from "@/components/SignupForm";

export default async function CadastroPage() {
  const user = await getSessionUser();
  if (user) redirect("/");
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
