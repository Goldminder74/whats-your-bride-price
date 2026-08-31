import type { Metadata } from "next";
import Image from "next/image";
import { regions } from "../../gameData";
import { PRODUCT_SAFEGUARD } from "../../productSafeguards";
import { createPublicAppUrl, createResultUrl } from "../../publicAppOrigin";
import { loadResultLanding, RESULT_UNAVAILABLE_COPY } from "../../resultLandingServer";
import { formatPublicExpiry } from "../../privacyDates";

type ResultPageProps = Readonly<{ params: Promise<{ slug: string }> | { slug: string } }>;
const genericTitle = "Culture Result Unavailable | What’s Your Bride Price?";
const genericDescription = `${RESULT_UNAVAILABLE_COPY} Choose an African regional edition and keep learning. ${PRODUCT_SAFEGUARD}`;

export async function generateMetadata({ params }: ResultPageProps): Promise<Metadata> {
  const { slug } = await Promise.resolve(params);
  const state = await loadResultLanding(slug);
  if (state.kind !== "active") {
    const canonical = /^[0-9a-f]{48}$/.test(slug) ? createResultUrl(slug) : createPublicAppUrl();
    return {
      title: genericTitle, description: genericDescription, alternates: { canonical },
      openGraph: { title: "Culture Result Unavailable", type: "website", url: canonical, description: genericDescription, siteName: "What’s Your Bride Price?", locale: "en_GB", images: [{ url: state.previewUrl, type: "image/png", width: 1200, height: 630, alt: "What’s Your Bride Price? culture quiz" }] },
      twitter: { card: "summary_large_image", title: "Culture Result Unavailable", description: genericDescription, images: [{ url: state.previewUrl, alt: "What’s Your Bride Price? culture quiz" }] },
    };
  }
  const { result } = state;
  const title = `${result.score}/${result.total} ${result.editionLabel} Culture Score | What’s Your Bride Price?`;
  const description = `${result.displayName} earned ${result.score}/${result.total} in the ${result.editionLabel} edition: ${result.resultTitle}. ${PRODUCT_SAFEGUARD}`;
  const alt = `${result.editionLabel} culture score ${result.score} out of ${result.total}, ${result.resultTitle}. ${PRODUCT_SAFEGUARD}`;
  return {
    title, description, alternates: { canonical: result.canonicalUrl },
    openGraph: { title, type: "website", url: result.canonicalUrl, description, siteName: "What’s Your Bride Price?", locale: "en_GB", images: [{ url: state.previewUrl, type: "image/png", width: 1200, height: 630, alt }] },
    twitter: { card: "summary_large_image", title, description, images: [{ url: state.previewUrl, alt }] },
  };
}

export default async function ResultPage({ params }: ResultPageProps) {
  const { slug } = await Promise.resolve(params);
  const state = await loadResultLanding(slug);
  if (state.kind !== "active") return (
    <main className="public-result-shell public-result-unavailable" data-result-unavailable><section>
      <p className="public-result-kicker">What’s Your Bride Price?</p><h1>{RESULT_UNAVAILABLE_COPY}</h1>
      <p>No name, score, edition or earlier result state is shown here.</p><a href={createPublicAppUrl()}>Choose an African region</a>
      <p className="public-result-safeguard">{PRODUCT_SAFEGUARD}</p>
    </section></main>
  );
  const { result } = state;
  const region = regions[result.edition];
  const artworkName = result.edition === "south" ? "southern" : result.edition;
  return (
    <main className={`public-result-shell theme-${result.edition}`} data-public-result data-result-slug={result.resultSlug}>
      <Image className="public-result-art" src={`/regions/${artworkName}-africa.webp`} alt="" aria-hidden="true" fill sizes="100vw" priority unoptimized />
      <section className="public-result-card">
        <p className="public-result-kicker">{result.editionLabel} edition · culture scorecard</p>
        <div className="public-result-identity">{result.avatarSrc ? <Image src={result.avatarSrc} alt={`Approved quiz avatar for ${result.displayName}`} width={88} height={88} unoptimized /> : <span aria-hidden="true">{region.mark}</span>}<div><small>Shared as</small><h1>{result.displayName}</h1></div></div>
        <div className="public-result-score" aria-label={`Culture score ${result.score} out of ${result.total}`}><strong>{result.score}</strong><span>/ {result.total}</span></div>
        <h2>{result.resultTitle}</h2>{result.masterySeal && <p className="public-result-mastery">✦ {result.masterySeal} seal earned</p>}
        <p className="public-result-safeguard">{PRODUCT_SAFEGUARD}</p>
        <p className="public-result-expiry">This public result expires on {formatPublicExpiry(result.expiresAt)}. Unpublishing or deletion may make it unavailable sooner.</p>
        <a className="public-result-play" href={createPublicAppUrl("/", { edition: result.edition })}>Play the {result.editionLabel} edition</a>
      </section>
    </main>
  );
}
