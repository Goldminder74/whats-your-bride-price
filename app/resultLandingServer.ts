import { activeFeatureFlags } from "./featureFlags.ts";
import { createPublicAppUrl, createResultPreviewUrl } from "./publicAppOrigin.ts";
import { RESULT_PREVIEW_FALLBACK_PATH } from "./resultPreview.ts";
import { getReviewResultRuntime } from "./resultReviewRuntime.ts";
import type { PublicResultView, ResultService } from "../db/resultService.ts";
import type { ResultMediaService } from "../db/resultMedia.ts";

export const RESULT_UNAVAILABLE_COPY = "This result is no longer available.";

export type ResultLandingState =
  | Readonly<{ kind: "active"; result: PublicResultView; previewUrl: string; previewHash: string | null; dynamicPreview: boolean }>
  | Readonly<{ kind: "unavailable"; message: typeof RESULT_UNAVAILABLE_COPY; previewUrl: string }>;

const unavailable = (): ResultLandingState => Object.freeze({
  kind: "unavailable",
  message: RESULT_UNAVAILABLE_COPY,
  previewUrl: createPublicAppUrl(RESULT_PREVIEW_FALLBACK_PATH),
});

export async function loadResultLanding(
  slug: unknown,
  options: Readonly<{ enabled?: boolean; resultService?: ResultService | null; mediaService?: ResultMediaService | null }> = {},
): Promise<ResultLandingState> {
  const enabled = options.enabled ?? activeFeatureFlags.dynamic_results;
  if (!enabled || typeof slug !== "string" || !/^[0-9a-f]{48}$/.test(slug)) return unavailable();
  const runtime = options.resultService === undefined ? await getReviewResultRuntime() : null;
  const resultService = options.resultService === undefined ? runtime?.resultService : options.resultService;
  const mediaService = options.mediaService === undefined ? runtime?.mediaService : options.mediaService;
  if (!resultService || !mediaService?.storageAvailable) return unavailable();
  try {
    const resolved = await resultService.getPublic(slug);
    if (!resolved) return unavailable();
    const media = await mediaService.getReady(slug);
    const view = resultService.toView(resolved);
    if (!media) return Object.freeze({
      kind: "active" as const,
      result: view,
      previewUrl: createPublicAppUrl(RESULT_PREVIEW_FALLBACK_PATH),
      previewHash: null,
      dynamicPreview: false,
    });
    return Object.freeze({
      kind: "active" as const,
      result: view,
      previewUrl: createResultPreviewUrl(slug, media.record.contentHash),
      previewHash: media.record.contentHash,
      dynamicPreview: true,
    });
  } catch {
    return unavailable();
  }
}
