import { NextResponse } from "next/server";
import { createSupabaseServerClient, getAuthenticatedUser } from "@/lib/supabase-server";

type NotificationItem = { id: string; kind: "intro" | "vote"; startupId: string; startupName: string; title: string; body: string; createdAt: string; interestId?: string };

export async function GET() {
  try {
    const { supabase, user } = await getAuthenticatedUser();
    if (!supabase || !user) return NextResponse.json({ error: "Sign in to view notifications." }, { status: 401 });
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (profile?.role !== "founder") return NextResponse.json({ notifications: [] });

    const { data: startups, error: startupsError } = await supabase.from("startups").select("id, name").eq("founder_id", user.id);
    if (startupsError) return NextResponse.json({ error: startupsError.message }, { status: 502 });
    const startupIds = (startups ?? []).map((startup) => startup.id);
    if (!startupIds.length) return NextResponse.json({ notifications: [] });
    const startupNames = new Map((startups ?? []).map((startup) => [startup.id, startup.name]));
    const [interestResult, voteResult] = await Promise.all([
      supabase.from("investor_interests").select("id, startup_id, message, created_at, profiles(full_name)").in("startup_id", startupIds).eq("status", "interested").order("created_at", { ascending: false }).limit(12),
      supabase.from("votes").select("id, startup_id, created_at").in("startup_id", startupIds).order("created_at", { ascending: false }).limit(12)
    ]);
    const queryError = interestResult.error ?? voteResult.error;
    if (queryError) return NextResponse.json({ error: queryError.message }, { status: 502 });
    const notifications: NotificationItem[] = [];
    for (const interest of interestResult.data ?? []) {
      const profileRows = interest.profiles as { full_name?: string | null }[] | { full_name?: string | null } | null;
      const investor = Array.isArray(profileRows) ? profileRows[0] : profileRows;
      const investorName = investor?.full_name || "An investor";
      notifications.push({ id: `intro-${interest.id}`, kind: "intro", interestId: interest.id, startupId: interest.startup_id, startupName: startupNames.get(interest.startup_id) ?? "Your startup", title: "New intro request", body: `${investorName} wants to connect${interest.message ? `: ${interest.message}` : "."}`, createdAt: interest.created_at });
    }
    for (const vote of voteResult.data ?? []) {
      notifications.push({ id: `vote-${vote.id}`, kind: "vote", startupId: vote.startup_id, startupName: startupNames.get(vote.startup_id) ?? "Your startup", title: "New signal", body: `${startupNames.get(vote.startup_id) ?? "Your startup"} received a public signal.`, createdAt: vote.created_at });
    }
    notifications.sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
    return NextResponse.json({ notifications: notifications.slice(0, 15) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Notifications could not be loaded." }, { status: 502 });
  }
}
