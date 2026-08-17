import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { withApiErrors } from "@/lib/api-errors";

export const GET = withApiErrors("auth.me.GET", async () => {
  const user = await getSessionUser();
  return NextResponse.json({ user });
});
