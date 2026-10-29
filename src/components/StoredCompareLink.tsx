"use client";
import { useEffect, useState } from "react";

export function StoredCompareLink() {
  const [list, setList] = useState<string[]>([]);
  useEffect(() => {
    try { setList(JSON.parse(localStorage.getItem("cg_compare") ?? "[]")); } catch { /* ignore */ }
  }, []);
  if (list.length < 2) return <p className="text-sm muted">Tap &ldquo;+ Compare&rdquo; on any camp page to add it here.</p>;
  return <a className="btn-primary" href={`/compare?camps=${encodeURIComponent(list.join(","))}`}>Compare your {list.length} selected camps</a>;
}
