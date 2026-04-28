import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      image?: string | null;
      isOnboarded: boolean;
      username: string | null;
    };
  }
  interface User {
    id?: string;
    isOnboarded?: boolean;
    username?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    isOnboarded?: boolean;
    username?: string | null;
  }
}
