import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase-server";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(_request: Request, context: RouteContext) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return NextResponse.json({ error: "Sign in as a founder to manage intro requests." }, { status: 401 });

  const { id } = await context.params;
  const { data: contactedAt, error } = await supabase.rpc("acknowledge_intro_request", { p_interest_id: id });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ contactedAt });
}
