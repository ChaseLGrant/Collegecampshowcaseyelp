"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasFeature } from "../billing/entitlements";
import { getCurrentAccess } from "../server/access";
import { requireSql } from "../db";

const DEFAULT_LIST = "My camps";

/** Premium: save a camp to the visitor's default list. Every query is scoped to the signed-in user. */
export async function saveCamp(formData: FormData) {
  const campId = z.string().uuid().parse(formData.get("campId"));
  const slug = z.string().max(120).parse(formData.get("slug"));
  const { userId, access } = await getCurrentAccess();
  if (!userId || !hasFeature(access, "saved_lists")) throw new Error("Saved lists require Recruiting Insider");
  const sql = requireSql();
  let [list] = await sql<{ id: string }[]>`select id from saved_lists where user_id = ${userId} and name = ${DEFAULT_LIST}`;
  if (!list) [list] = await sql<{ id: string }[]>`insert into saved_lists (user_id, name) values (${userId}, ${DEFAULT_LIST}) returning id`;
  await sql`
    insert into saved_list_items (list_id, camp_id)
    select ${list.id}, id from camps where id = ${campId} and status = 'published'
    on conflict (list_id, camp_id) do nothing`;
  revalidatePath(`/camps/${slug}`);
  revalidatePath("/account");
}

export async function removeSavedCamp(formData: FormData) {
  const listId = z.string().uuid().parse(formData.get("listId"));
  const campId = z.string().uuid().parse(formData.get("campId"));
  const { userId } = await getCurrentAccess();
  if (!userId) return;
  // Ownership check (formerly RLS): only delete from the caller's own list.
  await requireSql()`
    delete from saved_list_items where list_id = ${listId} and camp_id = ${campId}
      and exists (select 1 from saved_lists l where l.id = ${listId} and l.user_id = ${userId})`;
  revalidatePath("/account");
}
