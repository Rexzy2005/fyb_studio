import { NextResponse } from "next/server";

import { getSession, isAdminEmail } from "@/backend/auth/session";

export const runtime = "nodejs";

export const GET = async () => {
  const session = await getSession();
  const isAdmin = isAdminEmail(session?.user?.email);
  return NextResponse.json({ isAdmin });
};
