import { PRODUCT_SAFEGUARD } from "./productSafeguards.ts";
import { createPublicAppUrl, createResultUrl } from "./publicAppOrigin.ts";
import { loadResultLanding, RESULT_UNAVAILABLE_COPY } from "./resultLandingServer.ts";

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export async function resultMetadataHtml(slug: string): Promise<string> {
  const state = await loadResultLanding(slug);
  const unavailable = state.kind !== "active";
  const canonical = unavailable
    ? (/^[0-9a-f]{48}$/.test(slug) ? createResultUrl(slug) : createPublicAppUrl())
    : state.result.canonicalUrl;
  const title = unavailable
    ? "Culture Result Unavailable | What’s Your Bride Price?"
    : `${state.result.score}/${state.result.total} ${state.result.editionLabel} Culture Score | What’s Your Bride Price?`;
  const description = unavailable
    ? `${RESULT_UNAVAILABLE_COPY} Choose an African regional edition and keep learning. ${PRODUCT_SAFEGUARD}`
    : `${state.result.displayName} earned ${state.result.score}/${state.result.total} in the ${state.result.editionLabel} edition: ${state.result.resultTitle}. ${PRODUCT_SAFEGUARD}`;
  const image = state.previewUrl;
  const alt = unavailable
    ? "What’s Your Bride Price? culture quiz"
    : `${state.result.editionLabel} culture score ${state.result.score} out of ${state.result.total}, ${state.result.resultTitle}. ${PRODUCT_SAFEGUARD}`;
  const tag = (attribute: "property" | "name", key: string, content: string) => `<meta ${attribute}="${key}" content="${escapeHtml(content)}"/>`;
  return [
    "<!--wybp-result-metadata-->",
    `<title>${escapeHtml(title)}</title>`,
    `<link rel="canonical" href="${escapeHtml(canonical)}"/>`,
    tag("name", "description", description),
    tag("property", "og:title", title), tag("property", "og:type", "website"), tag("property", "og:url", canonical),
    tag("property", "og:description", description), tag("property", "og:image", image), tag("property", "og:image:secure_url", image),
    tag("property", "og:image:type", "image/png"), tag("property", "og:image:width", "1200"), tag("property", "og:image:height", "630"),
    tag("property", "og:image:alt", alt), tag("property", "og:site_name", "What’s Your Bride Price?"), tag("property", "og:locale", "en_GB"),
    tag("name", "twitter:card", "summary_large_image"), tag("name", "twitter:title", title), tag("name", "twitter:description", description),
    tag("name", "twitter:image", image), tag("name", "twitter:image:alt", alt),
  ].join("");
}
