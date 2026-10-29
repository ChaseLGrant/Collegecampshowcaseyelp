import type { Metadata } from "next";
import { LoginForm } from "@/components/LoginForm";
import { safeNextPath } from "@/lib/security/urls";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reason?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="container-page max-w-md py-12">
      <h1 className="text-2xl font-bold">Sign in to CampGrade</h1>
      <div className="mt-6"><LoginForm next={safeNextPath(sp.next, "/account")} reason={sp.reason} /></div>
    </div>
  );
}
