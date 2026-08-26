import { env } from "cloudflare:workers";
import {
  AnalyticsService,
  D1AnalyticsRepository,
  InMemoryAnalyticsRateLimiter,
  InMemoryAnalyticsRepository,
  UnavailableAnalyticsRateLimiter,
} from "../db/analytics.ts";
import { reviewChallengeFixtures } from "./challengeEntry.ts";

declare const __WYBP_REVIEW_ANALYTICS_FIXTURES__: boolean | undefined;

const reviewEnabled = typeof __WYBP_REVIEW_ANALYTICS_FIXTURES__ === "boolean" && __WYBP_REVIEW_ANALYTICS_FIXTURES__;
let reviewService: AnalyticsService | null = null;

function reviewAnalyticsService(): AnalyticsService {
  if (reviewService) return reviewService;
  const repository = new InMemoryAnalyticsRepository();
  for (const fixture of reviewChallengeFixtures) {
    if (fixture.entry.validity === "valid") repository.challenges.set(fixture.entry.code, `review_challenge_${fixture.scenario}`);
  }
  reviewService = new AnalyticsService(repository, new InMemoryAnalyticsRateLimiter());
  return reviewService;
}

export function getAnalyticsService(): AnalyticsService | null {
  if (reviewEnabled) return reviewAnalyticsService();
  const runtime = env as unknown as { DB?: D1Database };
  if (!runtime.DB) return null;
  return new AnalyticsService(new D1AnalyticsRepository(runtime.DB), new UnavailableAnalyticsRateLimiter());
}
