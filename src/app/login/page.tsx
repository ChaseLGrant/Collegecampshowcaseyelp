import type { Metadata } from "next";
import { LoginForm } from "@/components/LoginForm";
import { authConfigured, googleAuthConfigured } from "@/lib/env";
import { safeNextPath } from "@/lib/security/urls";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reason?: string; mode?: string; error?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="container-page max-w-md py-12">
      <h1 className="text-2xl font-bold">Sign in to CampGrade</h1>
      <div className="mt-6">
        <LoginForm next={safeNextPath(sp.next, "/account")} reason={sp.reason} googleEnabled={googleAuthConfigured()} enabled={authConfigured()}
          initialMode={sp.mode === "signup" || sp.reason === "review" ? "signup" : "signin"} error={sp.error} />
      </div>
    </div>
  );
}
