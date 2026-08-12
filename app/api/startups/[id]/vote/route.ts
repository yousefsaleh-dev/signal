import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase-server";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) { return changeVote(context, "add"); }
export async function DELETE(_request: Request, context: RouteContext) { return changeVote(context, "remove"); }

async function changeVote(context: RouteContext, action: "add" | "remove") {
  const { id } = await context.params;
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return NextResponse.json({ error: "Sign in to add your signal." }, { status: 401 });
  const response = action === "add" ? await supabase.from("votes").insert({ startup_id: id, user_id: user.id }) : await supabase.from("votes").delete().eq("startup_id", id).eq("user_id", user.id);
  if (response.error && response.error.code !== "23505") return NextResponse.json({ error: response.error.message }, { status: 400 });
  const { data: startup, error: startupError } = await supabase.from("startups").select("votes_count").eq("id", id).maybeSingle();
  if (startupError) return NextResponse.json({ error: startupError.message }, { status: 502 });
  return NextResponse.json({ voted: action === "add", votes: Number(startup?.votes_count ?? 0), changed: !response.error });
}
