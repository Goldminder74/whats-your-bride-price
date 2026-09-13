import { activeFeatureFlags } from "./featureFlags.ts";
import { D1OwnerDashboardRepository, type OwnerDashboardRepository } from "../db/ownerDashboard.ts";

declare const __WYBP_REVIEW_OWNER_DASHBOARD_FIXTURES__: boolean | undefined;

export const ownerDashboardReviewFixturesEnabled =
  typeof __WYBP_REVIEW_OWNER_DASHBOARD_FIXTURES__ === "boolean" && __WYBP_REVIEW_OWNER_DASHBOARD_FIXTURES__;

export type OwnerDashboardRuntime = Readonly<{
  repository: OwnerDashboardRepository;
  commerceEnabled: boolean;
  review: boolean;
}>;

class ReviewOwnerDashboardRepository implements OwnerDashboardRepository {
  readonly storageAvailable = true;
  constructor(private readonly fixture: string) {}
  async aggregate() {
    const fixtureModule = await import("./ownerDashboardReview.ts");
    return fixtureModule.ownerDashboardReviewSnapshot(fixtureModule.parseOwnerDashboardReviewScenario(this.fixture));
  }
}

export async function getOwnerDashboardRuntime(fixture: string | undefined): Promise<OwnerDashboardRuntime | null> {
  if (ownerDashboardReviewFixturesEnabled) {
    if (fixture === "d1_unavailable") return null;
    return Object.freeze({ repository: new ReviewOwnerDashboardRepository(fixture || "healthy"), commerceEnabled: false, review: true });
  }
  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as { DB?: D1Database };
  if (!runtime.DB) return null;
  return Object.freeze({ repository: new D1OwnerDashboardRepository(runtime.DB), commerceEnabled: activeFeatureFlags.commerce, review: false });
}
