import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export default async function StartupPublicRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  if (!supabase) notFound();
  const { data: startup } = await supabase.from("startups").select("id").eq("id", id).eq("status", "launched").maybeSingle();
  if (!startup) notFound();
  redirect(`/?startup=${encodeURIComponent(id)}`);
}
