/** Restrained gold stars. Never rendered for camps without reviews. */
export function Stars({ value, size = "sm", label }: { value: number; size?: "sm" | "md" | "lg"; label?: string }) {
  const px = size === "lg" ? 22 : size === "md" ? 18 : 14;
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={label ?? `${value.toFixed(1)} out of 5 stars`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, value - i));
        return (
          <svg key={i} width={px} height={px} viewBox="0 0 20 20" aria-hidden="true">
            <defs>
              <linearGradient id={`s${i}-${Math.round(fill * 100)}`}>
                <stop offset={`${fill * 100}%`} stopColor="#C9A227" />
                <stop offset={`${fill * 100}%`} stopColor="#E8DDB5" />
              </linearGradient>
            </defs>
            <path fill={`url(#s${i}-${Math.round(fill * 100)})`} d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.5 7.7l5.9-.9L10 1.5z" />
          </svg>
        );
      })}
    </span>
  );
}
