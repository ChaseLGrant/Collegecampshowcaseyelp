export function SampleBanner({ mode }: { mode: "live" | "sample" | "empty" }) {
  if (mode === "live") return null;
  return (
    <div className="border-b border-amber-200 bg-amber-50 text-amber-900">
      <p className="container-page py-2 text-xs sm:text-sm">
        {mode === "sample"
          ? "Preview mode: listings shown are fictional sample data, not real events. Connect Supabase to load real camps."
          : "No database connected yet — camp listings will appear once Supabase is configured."}
      </p>
    </div>
  );
}
