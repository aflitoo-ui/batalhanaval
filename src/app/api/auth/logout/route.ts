import { NextResponse } from "next/server";
import { destroySessionCookie } from "@/lib/auth";
import { withApiErrors } from "@/lib/api-errors";

export const POST = withApiErrors("auth.logout.POST", async () => {
  await destroySessionCookie();
  return NextResponse.json({ ok: true });
});
