import type { NextAuthConfig } from "next-auth";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/settings",
  "/cases",
  "/customers",
  "/businesses",
  "/transactions",
  "/policies",
  "/audit-logs",
  "/select-organization",
];

export const authConfig = {
  providers: [],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isAuthenticated = !!auth?.user;
      const isProtected = PROTECTED_PREFIXES.some((prefix) =>
        nextUrl.pathname.startsWith(prefix)
      );
      if (isProtected && !isAuthenticated) {
        return false;
      }
      return true;
    },
  },
} satisfies NextAuthConfig;
