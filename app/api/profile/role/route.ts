import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase-server";
import type { SignalRole } from "@/lib/signal-types";

export async function PATCH(request: Request) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return NextResponse.json({ error: "Sign in to change your role." }, { status: 401 });

  const body = await request.json().catch(() => null) as { role?: unknown } | null;
  const role = body?.role;
  if (role !== "public" && role !== "investor" && role !== "founder") return NextResponse.json({ error: "Choose a valid role." }, { status: 400 });

  const { data, error } = await supabase.rpc("set_my_profile_role", { p_role: role });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ role: data as SignalRole });
}
