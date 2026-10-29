"use client";
import { useEffect } from "react";
import type { SportId } from "@/lib/sports";
import { rememberSport } from "./SportChips";

/** Visiting a sport directory keeps that sport selected across the site. */
export function RememberSport({ sport }: { sport: SportId }) {
  useEffect(() => rememberSport(sport), [sport]);
  return null;
}
