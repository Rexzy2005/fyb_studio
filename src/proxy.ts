import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { edgeAuthConfig } from "@/backend/auth/config.edge";
import { safeReturnPath } from "@/lib/auth/safeRedirect";

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
  const isTemplateUseRoute = /^\/templates\/[^/]+\/use(\/|$)/.test(path);
  const isTemplatePreviewRoute = /^\/templates\/[^/]+\/preview(\/|$)/.test(path);
  const isProtected =
    isOnboardingRoute ||
    isDashboardRoute ||
    isTemplateUseRoute ||
    isTemplatePreviewRoute;

  if (!isAuthed) {
    if (isProtected) {
      const url = new URL("/signin", nextUrl);
      url.searchParams.set("from", path + nextUrl.search);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (!isOnboarded) {
    if (isOnboardingRoute) return NextResponse.next();
    if (isSignin || isDashboardRoute || isTemplateUseRoute || isTemplatePreviewRoute) {
      const url = new URL("/onboarding", nextUrl);
      const intent =
        isTemplateUseRoute || isTemplatePreviewRoute
          ? path + nextUrl.search
          : isSignin
            ? nextUrl.searchParams.get("from")
            : null;
      const safe = safeReturnPath(intent, "");
      if (safe) url.searchParams.set("from", safe);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (isTemplatePreviewRoute) {
    const isHead = Boolean(session?.user?.isDepartmentHead);
    if (!isHead) {
      const idMatch = path.match(/^\/templates\/([^/]+)\/preview/);
      const fallback = idMatch
        ? `/templates/${idMatch[1]}/use`
        : "/templates";
      return NextResponse.redirect(new URL(fallback, nextUrl));
    }
  }

  if (isSignin || isOnboardingRoute) {
    const intent = nextUrl.searchParams.get("from");
    const target = safeReturnPath(intent, "/dashboard");
    return NextResponse.redirect(new URL(target, nextUrl));
  }
  return NextResponse.next();
});

export const config = {
  matcher: [
    "/signin",
    "/onboarding/:path*",
    "/dashboard/:path*",
    "/templates/:id/use",
    "/templates/:id/use/:path*",
    "/templates/:id/preview",
    "/templates/:id/preview/:path*",
  ],
};
