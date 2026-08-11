import { NextResponse } from "next/server";
import { normalizeHttpUrl } from "@/lib/input-validation";
import { createSupabaseServerClient, getAuthenticatedUser } from "@/lib/supabase-server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured on this deployment." }, { status: 503 });
  const { user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Sign in to open your profile." }, { status: 401 });
  const { data: profile, error } = await supabase.from("profiles").select("id, role, full_name, avatar_url, bio, website, interests").eq("id", user.id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  return NextResponse.json({ source: "supabase", profile, email: user.email ?? "" });
}

export async function PATCH(request: Request) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return NextResponse.json({ error: "Sign in to edit your profile." }, { status: 401 });
  const { data: currentProfile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "A valid profile is required." }, { status: 400 });
  const fullName = String(body.full_name ?? "").trim();
  if (fullName.length < 2 || fullName.length > 80) return NextResponse.json({ error: "Name must be between 2 and 80 characters." }, { status: 400 });
  const investorFields = currentProfile?.role === "investor" ? { bio: String(body.bio ?? "").trim().slice(0, 1000), website: normalizeHttpUrl(body.website) || null, interests: Array.isArray(body.interests) ? body.interests.map(String).map((interest) => interest.trim()).filter(Boolean).slice(0, 8) : [] } : {};
  if (currentProfile?.role === "investor" && body.website !== undefined && normalizeHttpUrl(body.website) === null) return NextResponse.json({ error: "Add a valid website URL." }, { status: 400 });
  const { data: profile, error } = await supabase.from("profiles").update({ full_name: fullName, ...investorFields }).eq("id", user.id).select("id, role, full_name, avatar_url, bio, website, interests").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ profile, email: user.email ?? "" });
}
