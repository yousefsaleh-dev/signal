export type UserRole = "public" | "investor" | "founder";
export type StartupStatus = "draft" | "launched";

export type Startup = {
  id: string;
  name: string;
  slogan: string;
  shortDescription: string;
  longDescription: string;
  category: string;
  stage: string;
  geography: string;
  website: string;
  accent: string;
  logoLetter: string;
  votes: number;
  interests: number;
  engagement: string;
  tags: string[];
  status: StartupStatus;
  slug?: string;
  logoUrl?: string | null;
  feedback?: number;
  views?: number;
  signalScore?: number;
  trending?: boolean;
  trendingScore?: number;
  createdAt?: string;
  launchedAt?: string | null;
};

export type Comment = {
  id: string;
  userId?: string;
  author: string;
  role: Exclude<UserRole, "founder">;
  content: string;
  date: string;
};
