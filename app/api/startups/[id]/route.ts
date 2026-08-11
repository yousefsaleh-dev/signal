import { NextResponse } from "next/server";
import { mapDatabaseStartup } from "@/lib/signal-mappers";
import { normalizeSignalScores } from "@/lib/signal-scoring";
import { createSupabaseServerClient, getAuthenticatedUser } from "@/lib/supabase-server";
import type { SignalComment } from "@/lib/signal-types";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured on this deployment." }, { status: 503 });
  const { data: startup, error } = await supabase.from("startups").select("*").eq("id", id).eq("status", "launched").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  if (!startup) return NextResponse.json({ error: "Startup not found." }, { status: 404 });
  const { data: rankingRows } = await supabase.from("startups").select("*").eq("status", "launched");
  const rankingSource = rankingRows ?? [startup];
  const { data: voteRows } = await supabase.from("votes").select("startup_id").in("startup_id", rankingSource.map((row) => row.id));
  const voteTotals = new Map<string, number>();
  for (const vote of voteRows ?? []) voteTotals.set(vote.startup_id, (voteTotals.get(vote.startup_id) ?? 0) + 1);
  const interestTotals = await Promise.all(rankingSource.map(async (row) => {
    const result = await supabase.rpc("get_startup_interest_count", { p_startup_id: row.id });
    return [row.id, typeof result.data === "number" && !result.error ? result.data : Number(row.investor_interest_count ?? 0)] as const;
  }));
  const interestTotalsById = new Map(interestTotals);
  const feedbackTotals = await Promise.all(rankingSource.map(async (row) => {
    const result = await supabase.rpc("get_startup_feedback_count", { p_startup_id: row.id });
    return [row.id, typeof result.data === "number" && !result.error ? result.data : Number(row.feedback_count ?? 0)] as const;
  }));
  const feedbackTotalsById = new Map(feedbackTotals);
  const rankedStartup = normalizeSignalScores(rankingSource.map((row) => mapDatabaseStartup({ ...row, votes_count: voteTotals.get(row.id) ?? 0, investor_interest_count: interestTotalsById.get(row.id) ?? 0, feedback_count: feedbackTotalsById.get(row.id) ?? 0 }))).find((row) => row.id === id) ?? mapDatabaseStartup({ ...startup, investor_interest_count: interestTotalsById.get(id) ?? startup.investor_interest_count, feedback_count: feedbackTotalsById.get(id) ?? startup.feedback_count });
  const { user } = await getAuthenticatedUser();
  const [commentRows, voteRow, saveRow, interestRow] = await Promise.all([
    supabase.from("comments").select("id, content, created_at, user_id, profiles(full_name, role, avatar_url)").eq("startup_id", id).order("created_at", { ascending: false }),
    user ? supabase.from("votes").select("id").eq("startup_id", id).eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
    user ? supabase.from("saves").select("id").eq("startup_id", id).eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
    user ? supabase.from("investor_interests").select("id, status").eq("startup_id", id).eq("investor_id", user.id).eq("status", "interested").maybeSingle() : Promise.resolve({ data: null })
  ]);
  const detailError = (("error" in commentRows ? commentRows.error : null) ?? ("error" in voteRow ? voteRow.error : null) ?? ("error" in saveRow ? saveRow.error : null) ?? ("error" in interestRow ? interestRow.error : null)) as { message: string } | null;
  if (detailError) return NextResponse.json({ error: detailError.message }, { status: 502 });
  const comments = (commentRows.data ?? []).map((comment) => mapComment(comment));
  return NextResponse.json({ source: "supabase", startup: rankedStartup, comments, viewer: { authenticated: Boolean(user), voted: Boolean(voteRow.data), saved: Boolean(saveRow.data), interested: Boolean(interestRow.data) } });
}

function mapComment(comment: Record<string, unknown>): SignalComment {
  const profileRows = comment.profiles as Record<string, unknown>[] | Record<string, unknown> | null;
  const profile = Array.isArray(profileRows) ? profileRows[0] : profileRows;
  const role = profile?.role === "investor" ? "investor" : "public";
  return { id: String(comment.id), userId: String(comment.user_id), author: String(profile?.full_name ?? "SIGNAL user"), role, avatarUrl: typeof profile?.avatar_url === "string" ? profile.avatar_url : null, content: String(comment.content), date: formatRelativeDate(String(comment.created_at)), createdAt: String(comment.created_at) };
}

function formatRelativeDate(isoDate: string) {
  const elapsedMinutes = Math.max(1, Math.round((Date.now() - new Date(isoDate).getTime()) / 60000));
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;
  if (elapsedMinutes < 1440) return `${Math.round(elapsedMinutes / 60)}h ago`;
  return `${Math.round(elapsedMinutes / 1440)}d ago`;
}
