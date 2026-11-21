import type { RegionKey } from "../app/gameData.ts";
import { classicBank } from "./classic.ts";
import type { BankQuestion, PublishedFile } from "./types.ts";

const bank = (loaded: Promise<unknown>) => loaded as Promise<{ default: PublishedFile }>;

const files: Record<RegionKey, () => Promise<{ default: PublishedFile }>> = {
  west: () => bank(import("./banks/west.ts")),
  east: () => bank(import("./banks/east.ts")),
  central: () => bank(import("./banks/central.ts")),
  north: () => bank(import("./banks/north.ts")),
  south: () => bank(import("./banks/south.ts")),
};

async function bundledPublished(region: RegionKey): Promise<PublishedFile> {
  const loaded = await files[region]();
  return loaded.default;
}

/**
 * The published files are already in the app bundle, same bytes as /question-bank/<region>.json.
 * Waiting on that asset request first held "Choosing 12 questions" for as long as the worker took
 * to answer. Use the bundle, and only hit the network if the chunk itself failed to load.
 */
async function readPublished(region: RegionKey): Promise<PublishedFile> {
  try {
    return await bundledPublished(region);
  } catch (error) {
    if (typeof window === "undefined") throw error;
    const response = await fetch(`/question-bank/${region}.json`);
    if (response.ok) {
      const file = await response.json() as PublishedFile;
      if (file && Array.isArray(file.questions)) return file;
    }
    throw error;
  }
}

export async function loadPublished(region: RegionKey): Promise<BankQuestion[]> {
  const file = await readPublished(region);
  return file.questions.filter((question) => question.lifecycleStatus === "published" && question.region === region);
}

const eligibleCache = new Map<RegionKey, Promise<BankQuestion[]>>();

/** Published bank plus the classic 60, classic first so a shared id keeps the live wording. */
export function loadEligible(region: RegionKey): Promise<BankQuestion[]> {
  const cached = eligibleCache.get(region);
  if (cached) return cached;
  const pending = loadPublished(region).then((published) => {
    const classic = classicBank(region);
    const seen = new Set(classic.map((question) => question.id));
    return [...classic, ...published.filter((question) => !seen.has(question.id))];
  }).catch((error: unknown) => {
    eligibleCache.delete(region);
    throw error;
  });
  eligibleCache.set(region, pending);
  return pending;
}
