import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { createAuditEvent } from "@regops-ai/database";
import { isRateLimited } from "./lib/auth/rate-limit";
import { verifyCredentials } from "./lib/auth/verify-credentials";
import { authConfig } from "./auth.config";

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  pages: authConfig.pages,
  secret: process.env.AUTH_SECRET,
  trustHost: process.env.AUTH_TRUST_HOST === "true",
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        const ip = req.headers?.get("x-forwarded-for") || "unknown";

        if (isRateLimited(ip)) {
          throw new Error("Too many login attempts. Please try again later.");
        }

        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;

        if (!email || !password) {
          throw new Error("Invalid credentials.");
        }

        const result = await verifyCredentials(email, password);

        if (!result.success) {
          throw new Error(result.error);
        }

        return result.user;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.sub && session.user) {
        session.user.id = token.sub;
      }
      return session;
    },
    async signIn({ user, account }) {
      if (account?.provider === "credentials" && user.id) {
        try {
          await createAuditEvent({
            actorUserId: user.id,
            action: "USER_LOGIN",
            entityType: "User",
            entityId: user.id,
          });
        } catch {
          // Audit failure should not block login
        }
      }
      return true;
    },
  },
});
