import "server-only";
import { cookies } from "next/headers";
import { SPORT_COOKIE, isSportId, type SportId } from "../sports";

/** The sport the visitor last chose (cookie). Null = all sports. */
export async function getStickySport(): Promise<SportId | null> {
  const v = (await cookies()).get(SPORT_COOKIE)?.value;
  return isSportId(v) ? v : null;
}

export async function getStickySportRaw(): Promise<string | null> {
  return (await cookies()).get(SPORT_COOKIE)?.value ?? null;
}
