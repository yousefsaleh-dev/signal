import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase-server";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return NextResponse.json({ error: "Sign in as an investor to request an introduction." }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "investor") return NextResponse.json({ error: "This action is available to investor profiles only." }, { status: 403 });
  const body = await request.json().catch(() => null) as { message?: string } | null;
  if (!body) return NextResponse.json({ error: "A valid intro request is required." }, { status: 400 });
  const message = body.message?.trim() ?? "";
  if (message.length > 500) return NextResponse.json({ error: "Keep the intro request under 500 characters." }, { status: 400 });
  const { data: existingInterest } = await supabase.from("investor_interests").select("id").eq("startup_id", id).eq("investor_id", user.id).eq("status", "interested").maybeSingle();
  if (existingInterest) return NextResponse.json({ error: "Interest has already been sent." }, { status: 409 });
  const { data: withdrawnInterest } = await supabase.from("investor_interests").select("id").eq("startup_id", id).eq("investor_id", user.id).eq("status", "withdrawn").order("updated_at", { ascending: false }).maybeSingle();
  const contactEmail = user.email?.trim() || null;
  let interestResult = withdrawnInterest
    ? await supabase.from("investor_interests").update({ status: "interested", message: message || null, contact_email: contactEmail, contacted_at: null }).eq("id", withdrawnInterest.id).select("id, status, created_at").single()
    : await supabase.from("investor_interests").insert({ startup_id: id, investor_id: user.id, status: "interested", message: message || null, contact_email: contactEmail }).select("id, status, created_at").single();
  if (interestResult.error && /contact_email|column/i.test(interestResult.error.message)) {
    interestResult = withdrawnInterest
      ? await supabase.from("investor_interests").update({ status: "interested", message: message || null }).eq("id", withdrawnInterest.id).select("id, status, created_at").single()
      : await supabase.from("investor_interests").insert({ startup_id: id, investor_id: user.id, status: "interested", message: message || null }).select("id, status, created_at").single();
  }
  const { data: interest, error } = interestResult;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ interest, count: await getInterestCount(supabase, id) });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return NextResponse.json({ error: "Sign in to manage your interest." }, { status: 401 });
  const { error } = await supabase.from("investor_interests").update({ status: "withdrawn" }).eq("startup_id", id).eq("investor_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ interested: false, count: await getInterestCount(supabase, id) });
}

async function getInterestCount(supabase: NonNullable<Awaited<ReturnType<typeof getAuthenticatedUser>>["supabase"]>, startupId: string) {
  const { data: count, error } = await supabase.rpc("get_startup_interest_count", { p_startup_id: startupId });
  if (!error && typeof count === "number") return count;
  const fallback = await supabase.from("investor_interests").select("id", { count: "exact", head: true }).eq("startup_id", startupId).eq("status", "interested");
  return fallback.count ?? 0;
}
