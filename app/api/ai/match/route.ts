import { NextResponse } from "next/server";
import { calculateSignalScore } from "@/lib/signal-scoring";
import { createSupabaseServerClient, getAuthenticatedUser } from "@/lib/supabase-server";

type StartupInput = { id: string; name: string; category: string; shortDescription: string; votes: number; interests: number; feedback: number; signalScore: number };
const fallbackAiQuota = new Map<string, { windowStartedAt: number; requestCount: number }>();

export async function POST(request: Request) {
  const { supabase: authenticatedClient, user } = await getAuthenticatedUser();
  if (!authenticatedClient || !user) return NextResponse.json({ error: "Sign in as an investor to use Signal Match." }, { status: 401 });
  const { data: profile } = await authenticatedClient.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "investor") return NextResponse.json({ error: "Signal Match is available to investor profiles only." }, { status: 403 });
  const { data: quotaAvailableFromDatabase, error: quotaError } = await authenticatedClient.rpc("consume_ai_match_quota");
  const quotaAvailable = quotaError ? consumeFallbackAiQuota(user.id) : Boolean(quotaAvailableFromDatabase);
  if (!quotaAvailable) return NextResponse.json({ error: "You can run up to 8 matches per minute. Please wait a moment." }, { status: 429 });
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL;
  if (!apiKey || !model) return NextResponse.json({ error: "Gemini is not configured on this deployment." }, { status: 503 });
  const body = await request.json().catch(() => null) as { query?: string } | null;
  const query = body?.query?.trim() ?? "";
  if (!query) return NextResponse.json({ error: "Tell SIGNAL what you are looking for." }, { status: 400 });
  if (query.length > 1000) return NextResponse.json({ error: "Keep your search under 1000 characters." }, { status: 400 });
  let startups: StartupInput[];
  try {
    startups = await getLaunchedStartups();
  } catch {
    return NextResponse.json({ error: "SIGNAL could not read the launched startup index." }, { status: 502 });
  }
  if (!startups.length) return NextResponse.json({ error: "There are no launched startups to match yet." }, { status: 404 });
  const prompt = `You are SIGNAL's startup matching engine. Match the investor request to the supplied launched startups. Return JSON only with this shape: {"summary":"short sentence","matches":[{"startupId":"exact id","matchScore":number,"reasons":["short reason"]}]}. Return at most 3 matches, only using supplied startup ids. Do not invent startups. Request: ${query}. Startups: ${JSON.stringify(startups)}`;
  let response: Response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.2 } }), cache: "no-store" });
  } catch {
    return NextResponse.json({ error: "SIGNAL could not reach Gemini. Try the match again." }, { status: 502 });
  }
  if (!response.ok) return NextResponse.json({ error: "Gemini could not complete the signal match." }, { status: 502 });
  const payload = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return NextResponse.json({ error: "Gemini returned an empty match." }, { status: 502 });
  try {
    const parsed = JSON.parse(text.replace(/^```json\s*|```$/g, "").trim()) as { summary?: string; matches?: unknown[] };
    const allowedIds = new Set(startups.map((startup) => startup.id));
    const matches = Array.isArray(parsed.matches) ? parsed.matches.map((match) => validateMatch(match, allowedIds)).filter((match): match is NonNullable<typeof match> => Boolean(match)).slice(0, 3) : [];
    return NextResponse.json({ source: "gemini", model, summary: parsed.summary?.trim() || `I found ${matches.length} startups that match your criteria.`, matches });
  } catch {
    return NextResponse.json({ error: "Gemini returned an invalid structured response." }, { status: 502 });
  }
}

function consumeFallbackAiQuota(userId: string) {
  const now = Date.now();
  const current = fallbackAiQuota.get(userId);
  if (!current || now - current.windowStartedAt >= 60000) {
    fallbackAiQuota.set(userId, { windowStartedAt: now, requestCount: 1 });
    return true;
  }
  if (current.requestCount >= 8) return false;
  current.requestCount += 1;
  return true;
}

async function getLaunchedStartups(): Promise<StartupInput[]> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("Supabase is not configured on this deployment.");
  const { data, error } = await supabase.from("startups").select("id, name, category, short_description, votes_count, investor_interest_count, feedback_count, view_count").eq("status", "launched").order("votes_count", { ascending: false }).limit(50);
  if (error) throw error;
  return (data ?? []).map((startup) => ({ id: startup.id, name: startup.name, category: startup.category, shortDescription: startup.short_description, votes: startup.votes_count, interests: startup.investor_interest_count, feedback: startup.feedback_count, signalScore: calculateSignalScore(startup.votes_count, startup.investor_interest_count, startup.feedback_count, startup.view_count) }));
}

function validateMatch(candidate: unknown, allowedIds: Set<string>) {
  if (!candidate || typeof candidate !== "object") return null;
  const match = candidate as Record<string, unknown>;
  const startupId = typeof match.startupId === "string" ? match.startupId : "";
  if (!allowedIds.has(startupId)) return null;
  const numericScore = Number(match.matchScore);
  const reasons = Array.isArray(match.reasons) ? match.reasons.filter((reason): reason is string => typeof reason === "string").slice(0, 3) : [];
  if (!Number.isFinite(numericScore) || !reasons.length) return null;
  return { startupId, matchScore: Math.max(0, Math.min(100, Math.round(numericScore))), reasons };
}
