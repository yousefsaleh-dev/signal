export function calculateTrendingScore(recentVotes: number, recentInterest: number, recentFeedback: number) {
  return recentVotes * 1.2 + recentInterest * 2.2 + recentFeedback * 1.5;
}

export function calculateRawSignalScore(votes: number, interests: number, feedback: number, views: number) {
  const publicMomentum = Math.min(45, votes * 5);
  const investorMomentum = Math.min(30, interests * 10);
  const conversation = Math.min(15, feedback * 5);
  const attention = Math.min(10, views / 10);
  return publicMomentum + investorMomentum + conversation + attention;
}

export function calculateSignalScore(votes: number, interests: number, feedback: number, views: number) {
  return Math.round(calculateRawSignalScore(votes, interests, feedback, views));
}

export function normalizeSignalScores<T extends { signalScore: number; rawSignalScore?: number }>(startups: T[]) {
  const highestRawScore = Math.max(0, ...startups.map((startup) => startup.rawSignalScore ?? startup.signalScore));
  if (!highestRawScore) return startups.map((startup) => ({ ...startup, signalScore: 0 }));
  return startups.map((startup) => ({
    ...startup,
    signalScore: (startup.rawSignalScore ?? startup.signalScore) === 0 ? 0 : Math.max(1, Math.round(((startup.rawSignalScore ?? startup.signalScore) / highestRawScore) * 100))
  }));
}
