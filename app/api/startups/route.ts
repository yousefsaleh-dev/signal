import { NextResponse } from "next/server";
import { mapDatabaseStartup } from "@/lib/signal-mappers";
import { calculateTrendingScore, normalizeSignalScores } from "@/lib/signal-scoring";
import { createSupabaseServerClient, getAuthenticatedUser } from "@/lib/supabase-server";
import type { SignalStartup } from "@/lib/signal-types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";
  const category = searchParams.get("category") ?? "All";
  const sort = searchParams.get("sort") ?? "top";
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured on this deployment." }, { status: 503 });
  const { user } = await getAuthenticatedUser();

  let startupQuery = supabase.from("startups").select("*").eq("status", "launched");
  if (category !== "All" && category !== "Trending" && category !== "New") startupQuery = startupQuery.eq("category", category);
  if (query) {
    const safeQuery = query.replace(/[(),]/g, " ");
    startupQuery = startupQuery.or(`name.ilike.%${safeQuery}%,slogan.ilike.%${safeQuery}%,short_description.ilike.%${safeQuery}%,category.ilike.%${safeQuery}%`);
  }
  const { data: startupRows, error } = await startupQuery;
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  const startupIds = (startupRows ?? []).map((startup) => startup.id);
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const [votes, comments, allVotes] = await Promise.all([supabase.from("votes").select("startup_id").in("startup_id", startupIds).gte("created_at", since), supabase.from("comments").select("startup_id").in("startup_id", startupIds).gte("created_at", since), supabase.from("votes").select("startup_id").in("startup_id", startupIds)]);
  const interests = user ? await supabase.from("investor_interests").select("startup_id").in("startup_id", startupIds).eq("status", "interested").gte("created_at", since) : { data: [], error: null };
  const activityError = votes.error ?? comments.error ?? allVotes.error ?? interests.error;
  if (activityError) return NextResponse.json({ error: activityError.message }, { status: 502 });
  const interestTotals = await Promise.all(startupIds.map(async (startupId) => {
    const result = await supabase.rpc("get_startup_interest_count", { p_startup_id: startupId });
    return { startupId, count: typeof result.data === "number" && !result.error ? result.data : null };
  }));
  const interestTotalsById = new Map(interestTotals.map((item) => [item.startupId, item.count]));
  const feedbackTotals = await Promise.all(startupIds.map(async (startupId) => {
    const result = await supabase.rpc("get_startup_feedback_count", { p_startup_id: startupId });
    return { startupId, count: typeof result.data === "number" && !result.error ? result.data : null };
  }));
  const feedbackTotalsById = new Map(feedbackTotals.map((item) => [item.startupId, item.count]));
  const activity = new Map<string, { votes: number; interest: number; feedback: number }>();
  for (const row of votes.data ?? []) incrementActivity(activity, row.startup_id, "votes");
  for (const row of comments.data ?? []) incrementActivity(activity, row.startup_id, "feedback");
  for (const row of interests.data ?? []) incrementActivity(activity, row.startup_id, "interest");
  const voteTotals = new Map<string, number>();
  for (const row of allVotes.data ?? []) voteTotals.set(row.startup_id, (voteTotals.get(row.startup_id) ?? 0) + 1);
  const rankedStartups = normalizeSignalScores((startupRows ?? []).map((startup) => { const recent = activity.get(startup.id) ?? { votes: 0, interest: 0, feedback: 0 }; const source = { ...startup, votes_count: voteTotals.get(startup.id) ?? 0, investor_interest_count: interestTotalsById.get(startup.id) ?? startup.investor_interest_count ?? 0, feedback_count: feedbackTotalsById.get(startup.id) ?? startup.feedback_count ?? 0 }; return mapDatabaseStartup(source, calculateTrendingScore(recent.votes, recent.interest, recent.feedback)); }));
  const startups = rankedStartups.filter((startup) => category !== "Trending" || startup.trending).sort((a, b) => sort === "new" || category === "New" ? b.createdAt.localeCompare(a.createdAt) : category === "Trending" ? b.trendingScore - a.trendingScore : compareSignalRank(b, a)).slice(0, 10);
  if (!user) return NextResponse.json({ source: "supabase", startups, viewer: { votedIds: [], savedIds: [] } }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  const [viewerVotes, viewerSaves] = await Promise.all([
    supabase.from("votes").select("startup_id").eq("user_id", user.id).in("startup_id", startupIds),
    supabase.from("saves").select("startup_id").eq("user_id", user.id).in("startup_id", startupIds)
  ]);
  const viewerError = viewerVotes.error ?? viewerSaves.error;
  if (viewerError) return NextResponse.json({ error: viewerError.message }, { status: 502 });
  return NextResponse.json({ source: "supabase", startups, viewer: { votedIds: (viewerVotes.data ?? []).map((vote) => vote.startup_id), savedIds: (viewerSaves.data ?? []).map((save) => save.startup_id) } }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}

function incrementActivity(activity: Map<string, { votes: number; interest: number; feedback: number }>, startupId: string, kind: "votes" | "interest" | "feedback") {
  const current = activity.get(startupId) ?? { votes: 0, interest: 0, feedback: 0 };
  current[kind] += 1;
  activity.set(startupId, current);
}

function compareSignalRank(left: SignalStartup, right: SignalStartup) {
  return (left.signalScore - right.signalScore)
    || ((left.rawSignalScore ?? left.signalScore) - (right.rawSignalScore ?? right.signalScore))
    || (left.votes - right.votes)
    || (left.interests - right.interests)
    || (left.feedback - right.feedback)
    || (left.views - right.views)
    || left.createdAt.localeCompare(right.createdAt);
}
