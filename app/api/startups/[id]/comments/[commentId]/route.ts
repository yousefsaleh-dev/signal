import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase-server";

type RouteContext = { params: Promise<{ id: string; commentId: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return NextResponse.json({ error: "Sign in to delete feedback." }, { status: 401 });

  const { id, commentId } = await context.params;
  const { error } = await supabase.from("comments").delete().eq("id", commentId).eq("startup_id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ deleted: true });
}
