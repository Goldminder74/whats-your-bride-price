import BridePriceGame from "./BridePriceGame";
import { resolveReviewChallengeFixture, resolveSafeguardReviewFixture } from "./challengeEntry";
import { entryContextFromRecord } from "./entryContext";
import { activeFeatureFlags } from "./featureFlags";
import { PRODUCT_SAFEGUARD } from "./productSafeguards";
import { resolveRoyalRevealReviewScenario } from "./royalRevealReview.ts";

export const metadata = {
  title: "What’s Your Bride Price? | The Pan-African Party Game",
  description: `Choose a region, answer 12 culture-inspired questions, and reveal a playful ceremonial culture score. ${PRODUCT_SAFEGUARD}`,
};

type HomeProps = {
  searchParams?:
    | Promise<Record<string, string | string[] | undefined>>
    | Record<string, string | string[] | undefined>;
};

export default async function Home({ searchParams }: HomeProps) {
  const resolvedSearchParams = searchParams ? await Promise.resolve(searchParams) : {};
  const initialEntryContext = activeFeatureFlags.fast_entry
    ? entryContextFromRecord(resolvedSearchParams)
    : undefined;
  const fixtureValue = resolvedSearchParams.fixture;
  const fixtureId = typeof fixtureValue === "string" ? fixtureValue : undefined;
  const safeguardFixtureValue = resolvedSearchParams.safeguard_fixture;
  const safeguardFixtureId = typeof safeguardFixtureValue === "string" ? safeguardFixtureValue : undefined;
  const commerceFixtureValue = resolvedSearchParams.commerce_fixture;
  const royalRevealReviewScenario = resolveRoyalRevealReviewScenario(typeof commerceFixtureValue === "string" ? commerceFixtureValue : undefined);
  const trustedChallenge = activeFeatureFlags.fast_entry && activeFeatureFlags.challenges
    ? resolveReviewChallengeFixture(fixtureId)
    : undefined;
  const safeguardReviewFixture = royalRevealReviewScenario
    ? Object.freeze({ screen: "result" as const, score: 12 as const, reducedMotion: false, nomination: false })
    : activeFeatureFlags.fast_entry
    ? resolveSafeguardReviewFixture(safeguardFixtureId)
    : undefined;
  return <BridePriceGame initialEntryContext={initialEntryContext} trustedChallenge={trustedChallenge} safeguardReviewFixture={safeguardReviewFixture} royalRevealReviewScenario={royalRevealReviewScenario} />;
}
