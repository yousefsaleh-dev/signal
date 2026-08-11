import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase-server";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) { return changeSave(context, "add"); }
export async function DELETE(_request: Request, context: RouteContext) { return changeSave(context, "remove"); }

async function changeSave(context: RouteContext, action: "add" | "remove") {
  const { id } = await context.params;
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return NextResponse.json({ error: "Sign in to save startups." }, { status: 401 });
  const response = action === "add" ? await supabase.from("saves").insert({ startup_id: id, user_id: user.id }) : await supabase.from("saves").delete().eq("startup_id", id).eq("user_id", user.id);
  if (response.error && response.error.code !== "23505") return NextResponse.json({ error: response.error.message }, { status: 400 });
  return NextResponse.json({ saved: action === "add" });
}
