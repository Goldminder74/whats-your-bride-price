import type { ResultVisibility } from "../db/dataContracts.ts";
import { activeFeatureFlags } from "./featureFlags.ts";
import type { PublicAppOrigin } from "./publicAppOrigin.ts";
import { shareProjectionFromPublicResult, type SafeShareProjection } from "./shareProjection.ts";

export interface ResultPublicationClient {
  readonly storageAvailable: boolean;
  readonly currentVisibility: ResultVisibility;
  publish(): Promise<SafeShareProjection>;
  unpublish(): Promise<void>;
}

type ReviewResultClientData = Readonly<{ resultSlug: string; anonymousSessionCredential: string }>;
declare const __WYBP_REVIEW_RESULT_CLIENT__: ReviewResultClientData | null | undefined;

export function createReviewResultPublicationClient(
  origin: PublicAppOrigin,
): ResultPublicationClient | undefined {
  const fixture = typeof __WYBP_REVIEW_RESULT_CLIENT__ === "object" && __WYBP_REVIEW_RESULT_CLIENT__;
  if (!activeFeatureFlags.dynamic_results || !fixture) return undefined;
  let visibility: ResultVisibility = "private";
  const mutate = async (action: "publish" | "unpublish") => {
    const response = await fetch(`/result/${fixture.resultSlug}/publication`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, anonymousSessionCredential: fixture.anonymousSessionCredential }),
    });
    if (!response.ok) throw new Error("result_publication_failed");
    return response.json() as Promise<Record<string, unknown>>;
  };
  return {
    storageAvailable: true,
    get currentVisibility() { return visibility; },
    async publish() {
      const response = await mutate("publish");
      const projection = shareProjectionFromPublicResult(
        response.result as never,
        response.resultUrl as string,
        origin,
      );
      if (!projection) throw new Error("unsafe_public_result_projection");
      visibility = "public";
      return projection;
    },
    async unpublish() { await mutate("unpublish"); visibility = "private"; },
  };
}
