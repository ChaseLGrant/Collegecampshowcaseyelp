import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { env, serviceRoleConfigured, supabaseConfigured } from "../env";

/** Supabase client acting as the signed-in visitor (RLS enforced). */
export async function getServerSupabase(): Promise<SupabaseClient | null> {
  if (!supabaseConfigured()) return null;
  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component; middleware refreshes sessions instead.
        }
      },
    },
  });
}

/** Anonymous client with no cookies — for cacheable public reads. */
export function getPublicSupabase(): SupabaseClient | null {
  if (!supabaseConfigured()) return null;
  return createClient(env.supabaseUrl, env.supabaseAnonKey, { auth: { persistSession: false } });
}

/**
 * Service-role client. Bypasses RLS — use only in trusted server code after an
 * explicit authorization check (admin pages, webhooks, cron).
 */
export function getServiceSupabase(): SupabaseClient | null {
  if (!serviceRoleConfigured()) return null;
  return createClient(env.supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
