import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { z } from "zod";
import { upsertOAuthUser, verifyPassword } from "@/lib/auth/users";
import { databaseConfigured, googleAuthConfigured } from "@/lib/env";

const credentialsSchema = z.object({ email: z.string().trim().toLowerCase().email().max(254), password: z.string().min(1).max(128) });

const providers: Provider[] = [
  Credentials({
    id: "credentials",
    name: "Email and password",
    credentials: { email: { label: "Email", type: "email" }, password: { label: "Password", type: "password" } },
    async authorize(raw) {
      if (!databaseConfigured()) return null;
      const parsed = credentialsSchema.safeParse(raw);
      if (!parsed.success) return null;
      const u = await verifyPassword(parsed.data.email, parsed.data.password);
      return u ? { id: u.id, email: u.email, name: u.name } : null;
    },
  }),
];
if (googleAuthConfigured()) providers.push(Google({ allowDangerousEmailAccountLinking: false }));

/**
 * Auth.js (NextAuth v5). Stateless JWT sessions carry only the app user id;
 * role and profile are always read fresh from Postgres (src/lib/server/auth.ts),
 * so a role change in SQL takes effect on the next request.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: "jwt", maxAge: 30 * 24 * 3600 },
  pages: { signIn: "/login", error: "/login" },
  trustHost: true,
  callbacks: {
    async signIn({ account, profile, user }) {
      if (account?.provider !== "google") return true;
      const email = (profile?.email ?? user.email ?? "").toLowerCase();
      if (!email) return false;
      const id = await upsertOAuthUser({
        provider: "google", providerAccountId: account.providerAccountId, email,
        emailVerified: Boolean((profile as { email_verified?: boolean } | undefined)?.email_verified),
        name: user.name ?? null, image: user.image ?? null,
      });
      if (!id) return "/login?error=unverified";
      user.id = id;
      return true;
    },
    async jwt({ token, user }) {
      if (user?.id) token.uid = user.id;
      return token;
    },
    async session({ session, token }) {
      if (token.uid && session.user) session.user.id = token.uid as string;
      return session;
    },
  },
});
