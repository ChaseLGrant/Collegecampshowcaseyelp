"use client";

import { useEffect, useRef, useState } from "react";
import type { CampLogo } from "@/lib/logos";

const SIZES = {
  sm: { box: "h-10 w-10 rounded-lg", text: "text-[11px]", pad: "p-1" },
  lg: { box: "h-16 w-16 rounded-xl", text: "text-base", pad: "p-1.5" },
} as const;

/**
 * Organizer/school logo tile. Local logo -> organizer-domain icon -> initials badge.
 * Falls back to initials if an image fails to load or (for remote icons) comes back tiny.
 */
export function OrgLogoView({ logo, size = "sm", className = "" }: { logo: CampLogo; size?: keyof typeof SIZES; className?: string }) {
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const isFavicon = logo.kind === "favicon";
  // An image that errored before hydration never fires onError; check once on mount.
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && (img.naturalWidth === 0 || (isFavicon && img.naturalWidth < 32))) setFailed(true);
  }, [isFavicon]);
  const s = SIZES[size];
  const alt = `${logo.label} logo`;

  if (logo.kind === "initials" || failed) {
    return (
      <span
        role="img"
        aria-label={alt}
        title={logo.label}
        className={`inline-flex shrink-0 select-none items-center justify-center border border-navy-100 bg-navy-50 font-bold tracking-tight text-brand ${s.box} ${s.text} ${className}`}
      >
        {logo.initials}
      </span>
    );
  }

  const bg = logo.kind === "local" && logo.bg ? logo.bg : "#ffffff";
  return (
    <span
      title={logo.label}
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden border border-navy-100 ${s.box} ${s.pad} ${className}`}
      style={{ backgroundColor: bg }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny static/remote icons; next/image adds nothing here */}
      <img
        ref={imgRef}
        src={logo.src}
        alt={alt}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        className="h-full w-full object-contain"
        onError={() => setFailed(true)}
        onLoad={(e) => {
          if (logo.kind === "favicon" && e.currentTarget.naturalWidth > 0 && e.currentTarget.naturalWidth < 32) setFailed(true);
        }}
      />
    </span>
  );
}
