import { NextResponse } from "next/server";
import { mapDatabaseStartup } from "@/lib/signal-mappers";
import { createSupabaseServerClient, getAuthenticatedUser } from "@/lib/supabase-server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured on this deployment." }, { status: 503 });
  const { user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Sign in to view saved startups." }, { status: 401 });
  const { data, error } = await supabase.from("saves").select("created_at, startups(*)").eq("user_id", user.id).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  const savedStartups = (data ?? []).map((save) => Array.isArray(save.startups) ? save.startups[0] : save.startups).filter(Boolean).filter((startup) => startup.status === "launched").map((startup) => mapDatabaseStartup(startup));
  return NextResponse.json({ source: "supabase", startups: savedStartups });
}
