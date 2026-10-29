"use server";
import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { z } from "zod";
import { signIn } from "@/auth";
import { createPasswordUser, emailSchema, passwordSchema } from "../auth/users";
import { authConfigured, googleAuthConfigured } from "../env";
import { clientIp, rateLimit } from "../security/rate-limit";
import { safeNextPath } from "../security/urls";

export type AuthFormState = { error?: string } | undefined;

const signUpSchema = z.object({
  name: z.string().trim().max(100).optional().transform((v) => v || null),
  email: emailSchema,
  password: passwordSchema,
});

async function passwordSignIn(email: string, password: string, next: string): Promise<AuthFormState> {
  try {
    await signIn("credentials", { email, password, redirectTo: next });
  } catch (e) {
    if (e instanceof AuthError) return { error: "That email and password don't match an account." };
    throw e; // NEXT_REDIRECT on success
  }
  return undefined;
}

export async function signInWithPassword(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!authConfigured()) return { error: "Sign-in isn't configured yet." };
  const ip = clientIp(await headers());
  if (!rateLimit(`signin:${ip}`, 20, 15 * 60_000).ok) return { error: "Too many attempts. Wait a few minutes and try again." };
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };
  return passwordSignIn(email, password, safeNextPath(String(formData.get("next") ?? ""), "/account"));
}

export async function signUpWithPassword(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!authConfigured()) return { error: "Sign-up isn't configured yet." };
  const ip = clientIp(await headers());
  if (!rateLimit(`signup:${ip}`, 10, 3600_000).ok) return { error: "Too many sign-ups from this network. Try again later." };
  const parsed = signUpSchema.safeParse({ name: formData.get("name") ?? undefined, email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message === "Invalid email" ? "Enter a valid email address." : parsed.error.issues[0]?.message ?? "Check the form." };
  const created = await createPasswordUser(parsed.data.email, parsed.data.password, parsed.data.name);
  if (created === "exists") return { error: "An account with that email already exists. Sign in instead." };
  return passwordSignIn(parsed.data.email, parsed.data.password, safeNextPath(String(formData.get("next") ?? ""), "/account"));
}

export async function signInWithGoogle(formData: FormData) {
  if (!googleAuthConfigured()) return;
  await signIn("google", { redirectTo: safeNextPath(String(formData.get("next") ?? ""), "/account") });
}
