import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { edgeAuthConfig } from "@/backend/auth/config.edge";

const { auth } = NextAuth(edgeAuthConfig);

export default auth((req) => {
  const { nextUrl } = req;
  const session = req.auth;
  const isAuthed = Boolean(session?.user?.id);
  const isOnboarded = Boolean(session?.user?.isOnboarded);

  const path = nextUrl.pathname;
  const isSignin = path === "/signin";
  const isOnboardingRoute = path === "/onboarding" || path.startsWith("/onboarding/");
  const isDashboardRoute = path === "/dashboard" || path.startsWith("/dashboard/");

  if (!isAuthed) {
    if (isOnboardingRoute || isDashboardRoute) {
      const url = new URL("/signin", nextUrl);
      url.searchParams.set("from", path);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (!isOnboarded) {
    if (isOnboardingRoute) return NextResponse.next();
    if (isSignin || isDashboardRoute) {
      return NextResponse.redirect(new URL("/onboarding", nextUrl));
    }
    return NextResponse.next();
  }

  if (isSignin || isOnboardingRoute) {
    return NextResponse.redirect(new URL("/dashboard", nextUrl));
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/signin", "/onboarding/:path*", "/dashboard/:path*"],
};
