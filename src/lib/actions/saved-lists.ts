"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasFeature } from "../billing/entitlements";
import { getCurrentAccess } from "../server/access";
import { getServerSupabase } from "../supabase/server";

const DEFAULT_LIST = "My camps";

/** Premium: save a camp to the visitor's default list. RLS ensures users only touch their own lists. */
export async function saveCamp(formData: FormData) {
  const campId = z.string().uuid().parse(formData.get("campId"));
  const slug = z.string().max(120).parse(formData.get("slug"));
  const { userId, access } = await getCurrentAccess();
  if (!userId || !hasFeature(access, "saved_lists")) throw new Error("Saved lists require Recruiting Insider");
  const db = (await getServerSupabase())!;
  let { data: list } = await db.from("saved_lists").select("id").eq("user_id", userId).eq("name", DEFAULT_LIST).maybeSingle();
  if (!list) ({ data: list } = await db.from("saved_lists").insert({ user_id: userId, name: DEFAULT_LIST }).select("id").single());
  await db.from("saved_list_items").upsert({ list_id: list!.id, camp_id: campId }, { onConflict: "list_id,camp_id", ignoreDuplicates: true });
  revalidatePath(`/camps/${slug}`);
  revalidatePath("/account");
}

export async function removeSavedCamp(formData: FormData) {
  const listId = z.string().uuid().parse(formData.get("listId"));
  const campId = z.string().uuid().parse(formData.get("campId"));
  const db = await getServerSupabase();
  if (!db) return;
  await db.from("saved_list_items").delete().eq("list_id", listId).eq("camp_id", campId);
  revalidatePath("/account");
}
