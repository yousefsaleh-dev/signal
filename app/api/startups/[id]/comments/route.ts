import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase-server";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return NextResponse.json({ error: "Sign in to leave feedback." }, { status: 401 });
  const body = await request.json().catch(() => null) as { content?: string } | null;
  const content = body?.content?.trim() ?? "";
  if (!content) return NextResponse.json({ error: "Feedback cannot be empty." }, { status: 400 });
  const { data: comment, error } = await supabase.from("comments").insert({ startup_id: id, user_id: user.id, content }).select("id, content, created_at, user_id, profiles(full_name, role, avatar_url)").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const profile = Array.isArray(comment.profiles) ? comment.profiles[0] : comment.profiles;
  return NextResponse.json({ comment: { id: comment.id, userId: user.id, author: profile?.full_name ?? "You", role: profile?.role === "investor" ? "investor" : "public", avatarUrl: profile?.avatar_url ?? null, content: comment.content, date: "just now", createdAt: comment.created_at } });
}
