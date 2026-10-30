import { EDITORIAL_EXPLAINER, EDITORIAL_LABEL, hasEditorialRating } from "@/lib/editorial";
import type { EditorialRating as Editorial } from "@/lib/types";

/** "Editor's Pick" badge. Purely editorial — unrelated to parent reviews. */
export function EditorsPickBadge({ pick }: { pick: boolean }) {
  if (!pick) return null;
  return (
    <span className="tag bg-amber-100 font-semibold text-amber-900" title={EDITORIAL_EXPLAINER}>
      ★ Editor&apos;s Pick
    </span>
  );
}

/**
 * CampGrade's own staff rating, always labeled and visually distinct from the
 * community (parent) star rating. Renders nothing when the camp has no editorial score.
 */
export function EditorialRatingBadge({ editorial, size = "sm", showExplainer = false }: {
  editorial: Editorial; size?: "sm" | "md"; showExplainer?: boolean;
}) {
  if (!hasEditorialRating(editorial)) return null;
  const score = editorial.score.toFixed(1);
  return (
    <span className="inline-flex flex-col gap-0.5">
      <span
        className={`inline-flex items-center gap-1.5 ${size === "md" ? "text-base" : "text-sm"}`}
        title={EDITORIAL_EXPLAINER}
        aria-label={`${EDITORIAL_LABEL} ${score} out of 5. ${EDITORIAL_EXPLAINER}`}
      >
        <span className="font-medium text-navy-700">{EDITORIAL_LABEL}</span>
        <span className="font-semibold text-navy" aria-hidden="true">
          <span className="text-[#C9A227]">★</span> {score}
        </span>
        <span className="cursor-help text-xs text-navy-300" aria-hidden="true">ⓘ</span>
      </span>
      {showExplainer && <span className="text-xs text-navy-500">{EDITORIAL_EXPLAINER}</span>}
    </span>
  );
}
