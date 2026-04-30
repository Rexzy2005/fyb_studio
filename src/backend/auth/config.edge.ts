import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe auth config used by middleware. Contains no DB imports so it can
 * run in the edge runtime. The full config in ./config.ts extends this with
 * the actual provider list and server-only callbacks (signIn upsert, jwt DB
 * refresh).
 */
export const edgeAuthConfig: NextAuthConfig = {
  providers: [],
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/signin" },
  callbacks: {
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.userId as string | undefined) ?? "";
        session.user.isOnboarded = Boolean(token.isOnboarded);
        session.user.username = (token.username as string | null | undefined) ?? null;
        session.user.isDepartmentHead = Boolean(token.isDepartmentHead);
        session.user.departmentId =
          (token.departmentId as string | null | undefined) ?? null;
      }
      return session;
    },
  },
};
