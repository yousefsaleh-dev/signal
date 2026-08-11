import { calculateRawSignalScore, calculateSignalScore, calculateTrendingScore } from "@/lib/signal-scoring";
import type { SignalStartup } from "@/lib/signal-types";
import type { Startup } from "@/lib/ui-types";

const accentByCategory: Record<string, string> = { SaaS: "#3d36a8", HealthTech: "#0a7c72", FinTech: "#c85f36", Climate: "#2d7a4d", AI: "#b34973", EdTech: "#b37d23", Logistics: "#3e708e", AgriTech: "#6e8041", Cybersecurity: "#35485e", Retail: "#7d5d98" };

export function mapDatabaseStartup(startup: Record<string, unknown>, recentActivity = 0): SignalStartup {
  const category = String(startup.category ?? "SaaS");
  const votes = Number(startup.votes_count ?? 0);
  const interests = Number(startup.investor_interest_count ?? 0);
  const feedback = Number(startup.feedback_count ?? 0);
  const views = Number(startup.view_count ?? 0);
  const trendingScore = recentActivity;
  const rawSignalScore = calculateRawSignalScore(votes, interests, feedback, views);
  return { id: String(startup.id), slug: String(startup.slug), name: String(startup.name), slogan: String(startup.slogan ?? ""), shortDescription: String(startup.short_description ?? ""), longDescription: String(startup.long_description ?? ""), category, stage: "", geography: "", website: String(startup.website_url ?? ""), logoUrl: typeof startup.logo_url === "string" ? startup.logo_url : null, accent: accentByCategory[category] ?? "#3d36a8", logoLetter: String(startup.name ?? "S").slice(0, 1).toUpperCase(), votes, interests, feedback, views, engagement: `${Math.min(99, Math.round((votes + interests * 2 + feedback * 3) / Math.max(1, views) * 100))}%`, signalScore: calculateSignalScore(votes, interests, feedback, views), rawSignalScore, trending: trendingScore >= 3, trendingScore, tags: category ? [category.toLowerCase()] : [], status: String(startup.status) as SignalStartup["status"], createdAt: String(startup.created_at), launchedAt: typeof startup.launched_at === "string" ? startup.launched_at : null };
}

export function mapSignalStartupToUi(startup: SignalStartup): Startup {
  return { id: startup.id, name: startup.name, slogan: startup.slogan, shortDescription: startup.shortDescription, longDescription: startup.longDescription, category: startup.category, stage: startup.stage, geography: startup.geography, website: startup.website, accent: startup.accent, logoLetter: startup.logoLetter, votes: startup.votes, interests: startup.interests, engagement: startup.engagement, tags: startup.tags, status: startup.status, slug: startup.slug, logoUrl: startup.logoUrl, feedback: startup.feedback, views: startup.views, signalScore: startup.signalScore, trending: startup.trending, trendingScore: startup.trendingScore, createdAt: startup.createdAt, launchedAt: startup.launchedAt };
}
