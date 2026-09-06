import Link from "next/link";
import DailyChallengeClient from "../../../DailyChallengeClient.tsx";
import { activeFeatureFlags } from "../../../featureFlags.ts";
import { regionOrder, type RegionKey } from "../../../gameData.ts";
import { nextUtcChallengeBoundary, utcChallengeDate } from "../../../../db/dailyChallenge.ts";
import { readServerNow } from "../../../serverClock.ts";

export const dynamic = "force-dynamic";
export default async function DatedDailyPage({ params }: Readonly<{ params: Promise<{ region: string; date: string }> | { region: string; date: string } }>) {
  const { region, date } = await Promise.resolve(params);
  const serverNow = readServerNow();
  if (!activeFeatureFlags.daily_challenge || !regionOrder.includes(region as RegionKey) || date !== utcChallengeDate(serverNow)) return <main className="daily-unavailable"><h1>Daily challenge unavailable</h1><p>That daily link is no longer active.</p><Link href="/">Return to the game</Link></main>;
  return <DailyChallengeClient region={region as RegionKey} serverNow={serverNow} nextBoundary={nextUtcChallengeBoundary(serverNow)} streaksEnabled={activeFeatureFlags.streaks} />;
}
