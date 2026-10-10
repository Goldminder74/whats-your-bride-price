import type { Metadata } from "next";
import ChallengeLandingClient from "./ChallengeLandingClient";
import { loadChallengeLanding } from "../../challengeLandingServer";
import { PRODUCT_SAFEGUARD } from "../../productSafeguards";
import { createPublicAppUrl } from "../../publicAppOrigin";

export const metadata: Metadata = {
  title: "A Culture Challenge Awaits | What’s Your Bride Price?",
  description: `Open a private culture challenge and choose an African regional quiz. ${PRODUCT_SAFEGUARD}`,
  openGraph: {
    title: "A Culture Challenge Awaits",
    description: `Open the invitation and test your African culture knowledge. ${PRODUCT_SAFEGUARD}`,
    images: [createPublicAppUrl("/og-v2.png")],
  },
  twitter: {
    card: "summary_large_image",
    title: "A Culture Challenge Awaits",
    description: `Open the invitation and test your African culture knowledge. ${PRODUCT_SAFEGUARD}`,
    images: [createPublicAppUrl("/og-v2.png")],
  },
};

type ChallengePageProps = Readonly<{
  params: Promise<{ code: string }> | { code: string };
}>;

export default async function ChallengePage({ params }: ChallengePageProps) {
  const { code } = await Promise.resolve(params);
  const initialState = await loadChallengeLanding(code);
  return <ChallengeLandingClient code={code} initialState={initialState} />;
}
