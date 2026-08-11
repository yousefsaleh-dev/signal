import { NextResponse } from "next/server";
import { normalizeHttpUrl } from "@/lib/input-validation";
import { categories } from "@/lib/startup-categories";
import { mapDatabaseStartup } from "@/lib/signal-mappers";
import { normalizeSignalScores } from "@/lib/signal-scoring";
import { createSupabaseServerClient, getAuthenticatedUser } from "@/lib/supabase-server";

const startupFields = "id, founder_id, name, slug, slogan, short_description, long_description, logo_url, website_url, category, status, votes_count, investor_interest_count, feedback_count, view_count, created_at, updated_at, launched_at";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return NextResponse.json({ error: "Supabase is not configured on this deployment." }, { status: 503 });
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Sign in as a founder to open your studio." }, { status: 401 });
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if (profile?.role !== "founder") return NextResponse.json({ error: "Founder Studio is available to founder profiles only." }, { status: 403 });
    const { data: startup, error } = await supabase.from("startups").select(startupFields).eq("founder_id", user.id).order("created_at", { ascending: true }).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 502 });
    const interests = startup ? await getFounderInterests(supabase, startup.id) : [];
    if (!startup) return NextResponse.json({ source: "supabase", startup, interests });
    const { data: launchedRows } = await supabase.from("startups").select(startupFields).eq("status", "launched");
    const launchedIds = (launchedRows ?? [startup]).map((row) => row.id);
    const { data: voteRows } = await supabase.from("votes").select("startup_id").in("startup_id", launchedIds);
    const voteTotals = new Map<string, number>();
    for (const vote of voteRows ?? []) voteTotals.set(vote.startup_id, (voteTotals.get(vote.startup_id) ?? 0) + 1);
    const metricRows = await Promise.all((launchedRows ?? [startup]).map(async (row) => {
      const [interestResult, feedbackResult] = await Promise.all([
        supabase.rpc("get_startup_interest_count", { p_startup_id: row.id }),
        supabase.rpc("get_startup_feedback_count", { p_startup_id: row.id })
      ]);
      return { startupId: row.id, interests: !interestResult.error && typeof interestResult.data === "number" ? interestResult.data : Number(row.investor_interest_count ?? 0), feedback: !feedbackResult.error && typeof feedbackResult.data === "number" ? feedbackResult.data : Number(row.feedback_count ?? 0) };
    }));
    const metricByStartup = new Map(metricRows.map((row) => [row.startupId, row]));
    const founderMetrics = metricByStartup.get(startup.id) ?? { interests: Number(startup.investor_interest_count ?? 0), feedback: Number(startup.feedback_count ?? 0) };
    const rankedStartup = normalizeSignalScores((launchedRows ?? [startup]).map((row) => { const metrics = metricByStartup.get(row.id) ?? { interests: Number(row.investor_interest_count ?? 0), feedback: Number(row.feedback_count ?? 0) }; return mapDatabaseStartup({ ...row, votes_count: voteTotals.get(row.id) ?? 0, investor_interest_count: metrics.interests, feedback_count: metrics.feedback }); })).find((row) => row.id === startup.id);
    return NextResponse.json({ source: "supabase", startup: { ...startup, votes_count: rankedStartup?.votes ?? startup.votes_count, investor_interest_count: founderMetrics.interests, feedback_count: founderMetrics.feedback, signal_score: rankedStartup?.signalScore ?? mapDatabaseStartup(startup).signalScore }, interests });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Founder studio could not be loaded.") }, { status: 502 });
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await getAuthenticatedUser();
    if (!supabase || !user) return NextResponse.json({ error: "Sign in as a founder to create a startup." }, { status: 401 });
    const body = await parseRequestBody(request);
    if (!body) return NextResponse.json({ error: "A valid JSON request body is required." }, { status: 400 });
    const validationError = validateStartupPayload(body);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if (profile?.role !== "founder") return NextResponse.json({ error: "Choose the founder role before creating a startup." }, { status: 403 });
    const { data: startup, error } = await supabase.from("startups").insert(toStartupRow(body, user.id)).select(startupFields).single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ startup }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Startup could not be created.") }, { status: 502 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { supabase, user } = await getAuthenticatedUser();
    if (!supabase || !user) return NextResponse.json({ error: "Sign in as a founder to edit your startup." }, { status: 401 });
    const body = await parseRequestBody(request);
    if (!body) return NextResponse.json({ error: "A valid JSON request body is required." }, { status: 400 });
    const validationError = validateStartupPayload(body, true);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    const startupId = String(body.id ?? "");
    if (!startupId) return NextResponse.json({ error: "Startup id is required." }, { status: 400 });
    const { data: startup, error } = await supabase.from("startups").update(toStartupRow(body, user.id, true)).eq("id", startupId).eq("founder_id", user.id).select(startupFields).single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ startup });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Startup could not be updated.") }, { status: 502 });
  }
}

async function getFounderInterests(supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>, startupId: string) {
  const baseFields = "id, investor_id, status, message, contact_email, created_at";
  const legacyFields = "id, investor_id, status, message, created_at";
  const withContactStatus = await supabase.from("investor_interests").select(`${baseFields}, contacted_at`).eq("startup_id", startupId).eq("status", "interested").order("created_at", { ascending: false });
  let interests: Array<{ investor_id: string; [key: string]: unknown }> = withContactStatus.data ?? [];
  if (!withContactStatus.error) return attachInvestorProfiles(supabase, interests);
  if (!/contacted_at|column/i.test(withContactStatus.error.message)) throw withContactStatus.error;
  const legacyResult = await supabase.from("investor_interests").select(legacyFields).eq("startup_id", startupId).eq("status", "interested").order("created_at", { ascending: false });
  if (legacyResult.error) throw legacyResult.error;
  interests = legacyResult.data ?? [];
  return attachInvestorProfiles(supabase, interests);
}

async function attachInvestorProfiles(supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>, interests: Array<{ investor_id: string }>) {
  const investorIds = [...new Set(interests.map((interest) => interest.investor_id).filter(Boolean))];
  if (!investorIds.length) return interests;
  const { data: profiles, error } = await supabase.from("profiles").select("id, role, full_name, avatar_url, bio, website, interests").in("id", investorIds);
  if (error) throw error;
  const profilesById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  return interests.map((interest) => ({ ...interest, profiles: profilesById.get(interest.investor_id) ?? null }));
}

async function parseRequestBody(request: Request): Promise<Record<string, unknown> | null> {
  const bodyText = await request.text();
  if (!bodyText.trim()) return null;
  try {
    const parsedBody: unknown = JSON.parse(bodyText);
    if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) return null;
    return parsedBody as Record<string, unknown>;
  } catch {
    return null;
  }
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return fallback;
}

function validateStartupPayload(body: Record<string, unknown>, partial = false) {
  if (!partial && !String(body.name ?? "").trim()) return "Add a startup name.";
  if (!partial && !String(body.category ?? "").trim()) return "Choose a category.";
  if (body.name !== undefined && String(body.name).trim().length < 2) return "Startup name must be at least 2 characters.";
  if (body.name !== undefined && String(body.name).trim().length > 80) return "Startup name must be 80 characters or fewer.";
  if (body.slogan !== undefined && String(body.slogan).trim().length > 120) return "One-line promise must be 120 characters or fewer.";
  if (body.short_description !== undefined && String(body.short_description).length > 280) return "Short description must be 280 characters or fewer.";
  if (body.long_description !== undefined && String(body.long_description).length > 4000) return "Full story must be 4000 characters or fewer.";
  if (body.category !== undefined && !categories.slice(3).includes(String(body.category))) return "Choose a valid category.";
  if (body.website_url !== undefined && normalizeHttpUrl(body.website_url) === null) return "Add a valid website URL.";
  return "";
}

function toStartupRow(body: Record<string, unknown>, founderId: string, partial = false) {
  const fields = { founder_id: founderId, name: String(body.name ?? "").trim(), slug: String(body.slug ?? body.name ?? "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), slogan: String(body.slogan ?? "").trim(), short_description: String(body.short_description ?? "").trim(), long_description: String(body.long_description ?? "").trim(), logo_url: body.logo_url ? String(body.logo_url) : null, website_url: normalizeHttpUrl(body.website_url) || null, category: String(body.category ?? "").trim(), status: body.status === "launched" ? "launched" : "draft" };
  if (!partial) return fields;
  const editableFields: Record<string, string | null> = {};
  if (body.name !== undefined) editableFields.name = fields.name;
  if (body.slug !== undefined || body.name !== undefined) editableFields.slug = fields.slug;
  if (body.slogan !== undefined) editableFields.slogan = fields.slogan;
  if (body.short_description !== undefined) editableFields.short_description = fields.short_description;
  if (body.long_description !== undefined) editableFields.long_description = fields.long_description;
  if (Object.prototype.hasOwnProperty.call(body, "logo_url")) editableFields.logo_url = fields.logo_url;
  if (Object.prototype.hasOwnProperty.call(body, "website_url")) editableFields.website_url = fields.website_url;
  if (body.category !== undefined) editableFields.category = fields.category;
  if (body.status !== undefined) editableFields.status = fields.status;
  return editableFields;
}
