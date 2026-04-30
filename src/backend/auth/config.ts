import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import { env } from "@/backend/env";
import { edgeAuthConfig } from "@/backend/auth/config.edge";
import {
  findUserById,
  upsertUserFromGoogle,
} from "@/backend/services/user.service";

const fullAuthConfig: NextAuthConfig = {
  ...edgeAuthConfig,
  providers: [
    Google({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: false,
    }),
  ],
  callbacks: {
    ...edgeAuthConfig.callbacks,

    async signIn({ user, account, profile }) {
      if (account?.provider !== "google") {
        console.warn("[auth.signIn] non-google provider denied:", account?.provider);
        return false;
      }
      if (!profile?.sub || !profile.email) {
        console.warn("[auth.signIn] missing profile.sub or profile.email", {
          hasSub: Boolean(profile?.sub),
          hasEmail: Boolean(profile?.email),
        });
        return false;
      }

      try {
        const dbUser = await upsertUserFromGoogle({
          googleId: profile.sub,
          email: profile.email,
          name: profile.name ?? user.name ?? "FYB Student",
          avatar:
            (typeof profile.picture === "string" ? profile.picture : null) ??
            user.image ??
            null,
        });

        user.id = dbUser._id.toString();
        user.isOnboarded = dbUser.isOnboarded;
        user.username = dbUser.username ?? null;
        user.isDepartmentHead = Boolean(dbUser.isDepartmentHead);
        user.departmentId = dbUser.department ? dbUser.department.toString() : null;
        return true;
      } catch (err) {
        console.error("[auth.signIn] upsert failed for", profile.email, err);
        return false;
      }
    },

    async jwt({ token, user, trigger }) {
      if (user) {
        token.userId = user.id ?? token.userId;
        token.isOnboarded = Boolean(user.isOnboarded);
        token.username = user.username ?? null;
        token.isDepartmentHead = Boolean(user.isDepartmentHead);
        token.departmentId = user.departmentId ?? null;
      }

      if (trigger === "update" && token.userId) {
        const fresh = await findUserById(token.userId);
        if (fresh) {
          token.isOnboarded = fresh.isOnboarded;
          token.username = fresh.username ?? null;
          token.isDepartmentHead = Boolean(fresh.isDepartmentHead);
          token.departmentId = fresh.department ? fresh.department.toString() : null;
        }
      }

      return token;
    },
  },
};

export const { handlers, signIn, signOut, auth } = NextAuth(fullAuthConfig);
