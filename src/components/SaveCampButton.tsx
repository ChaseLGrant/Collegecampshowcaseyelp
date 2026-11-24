"use client";
import { saveCamp } from "@/lib/actions/saved-lists";
import { useViewer } from "@/lib/client/viewer";

/** Insider-only "save" button, shown in the browser so the camp page itself can be cached. */
export function SaveCampButton({ campId, slug }: { campId: string; slug: string }) {
  const viewer = useViewer();
  if (!viewer?.features?.saved_lists) return null;
  return (
    <form action={saveCamp}>
      <input type="hidden" name="campId" value={campId} />
      <input type="hidden" name="slug" value={slug} />
      <button className="btn-ghost w-full">☆ Save to my camps</button>
    </form>
  );
}
