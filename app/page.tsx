import BridePriceGame from "./BridePriceGame";
import { entryContextFromRecord } from "./entryContext";
import { activeFeatureFlags } from "./featureFlags";

export const metadata = {
  title: "What’s Your Bride Price? | The Pan-African Party Game",
  description: "Choose a region, answer 12 culture-inspired questions, and reveal your playful ceremonial result.",
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
  return <BridePriceGame initialEntryContext={initialEntryContext} />;
}
