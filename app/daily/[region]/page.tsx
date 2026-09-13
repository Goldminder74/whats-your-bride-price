import Link from "next/link";
import DailyChallengeClient from "../../DailyChallengeClient.tsx";
import { activeFeatureFlags } from "../../featureFlags.ts";
import { regionOrder, type RegionKey } from "../../publicGameData.ts";
import { nextUtcChallengeBoundary } from "../../../db/dailyChallenge.ts";
import { readServerNow } from "../../serverClock.ts";

export const dynamic = "force-dynamic";
export default async function DailyRegionPage({ params }: Readonly<{ params: Promise<{ region: string }> | { region: string } }>) {
  const { region } = await Promise.resolve(params);
  if (!activeFeatureFlags.daily_challenge || !regionOrder.includes(region as RegionKey)) return <main className="daily-unavailable"><h1>Daily challenge unavailable</h1><p>This feature is not active in this build.</p><Link href="/">Return to the game</Link></main>;
  const serverNow = readServerNow();
  return <DailyChallengeClient region={region as RegionKey} serverNow={serverNow} nextBoundary={nextUtcChallengeBoundary(serverNow)} streaksEnabled={activeFeatureFlags.streaks} />;
}
