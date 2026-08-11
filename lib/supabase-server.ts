import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(cookieValues) {
        try {
          cookieValues.forEach(({ name, value: cookieValue, options }) => cookieStore.set(name, cookieValue, options));
        } catch {
          // Server Components cannot mutate cookies; route handlers can still refresh sessions.
        }
      }
    }
  });
}

export async function getAuthenticatedUser() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { supabase: null, user: null };
  const { data, error } = await supabase.auth.getUser();
  if (error?.name === "AuthSessionMissingError") return { supabase, user: null };
  if (error) throw error;
  return { supabase, user: data.user };
}
