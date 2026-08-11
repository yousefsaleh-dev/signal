export type SignalRole = "public" | "investor" | "founder";
export type SignalStartupStatus = "draft" | "launched";

export type SignalStartup = {
  id: string;
  slug: string;
  name: string;
  slogan: string;
  shortDescription: string;
  longDescription: string;
  category: string;
  stage: string;
  geography: string;
  website: string;
  logoUrl: string | null;
  accent: string;
  logoLetter: string;
  votes: number;
  interests: number;
  feedback: number;
  views: number;
  engagement: string;
  signalScore: number;
  rawSignalScore?: number;
  trending: boolean;
  trendingScore: number;
  tags: string[];
  status: SignalStartupStatus;
  createdAt: string;
  launchedAt: string | null;
};

export type SignalProfile = {
  id: string;
  role: SignalRole;
  fullName: string;
  avatarUrl: string | null;
  bio: string | null;
  website: string | null;
  interests: string[];
};

export type SignalComment = {
  id: string;
  userId: string;
  author: string;
  role: Exclude<SignalRole, "founder">;
  avatarUrl: string | null;
  content: string;
  date: string;
  createdAt: string;
};

export type SignalInterest = {
  id: string;
  status: "interested" | "withdrawn";
  message: string | null;
  createdAt: string;
  investor: SignalProfile;
};

export type AiMatch = {
  startupId: string;
  matchScore: number;
  reasons: string[];
};

export type AiMatchResponse = {
  summary: string;
  matches: AiMatch[];
};
