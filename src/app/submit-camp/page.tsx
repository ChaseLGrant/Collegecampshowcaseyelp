import type { Metadata } from "next";
import { SubmitCampForm } from "@/components/SubmitCampForm";

export const metadata: Metadata = { title: "Submit a camp", description: "Tell us about a college recruiting camp or showcase that's missing from Camp Check." };

export default function SubmitCampPage() {
  return (
    <div className="container-page max-w-2xl py-10">
      <h1 className="text-2xl font-bold">Submit a camp or showcase</h1>
      <p className="mt-1 text-sm muted">Know of an event we&apos;re missing? Share the official link and what you know, and it goes live on Camp Check right away. No account needed.</p>
      <div className="mt-6"><SubmitCampForm /></div>
    </div>
  );
}
