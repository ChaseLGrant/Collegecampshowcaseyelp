"use client";
import { useEffect, useState } from "react";

const KEY = "cg_compare";
const MAX = 4;

function read(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((s) => typeof s === "string").slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function CompareButton({ slug }: { slug: string }) {
  const [list, setList] = useState<string[]>([]);
  useEffect(() => setList(read()), []);
  const on = list.includes(slug);
  const toggle = () => {
    const next = on ? list.filter((s) => s !== slug) : [...list.filter((s) => s !== slug), slug].slice(-MAX);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
    setList(next);
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={toggle} className="btn-secondary" aria-pressed={on}>
        {on ? "✓ Added to compare" : "+ Compare"}
      </button>
      {list.length >= 2 && (
        <a className="link text-sm" href={`/compare?camps=${encodeURIComponent(list.join(","))}`}>Compare {list.length} camps →</a>
      )}
    </div>
  );
}
