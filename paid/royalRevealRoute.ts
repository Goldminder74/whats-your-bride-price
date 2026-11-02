import type { RegionKey } from "../app/gameData.ts";
import { CANONICAL_ORIGIN } from "./catalog.ts";
import { PaidError } from "./errors.ts";
import type { KvStore } from "./games.ts";
import { editionOf, factsForReveal, royalDecreePdf, royalDecreeSvg, tierExplanation, zipStored } from "./royalDecree.ts";
import { readCachedReveal, storeCachedReveal, type RevealFile } from "./royalRevealCache.ts";
import { resultTier } from "./shareCard.ts";
import { renderShareCardPng } from "./shareCardPng.ts";
import type { PaidRepository, RoyalRevealRecord } from "./repository.ts";

const TOKEN = /^[a-f0-9]{64}$/;
const PLAYER_ID = /^[A-Za-z0-9_-]{16,64}$/;
const ORDER_ID = /^ord_[a-f0-9]{32}$/;
const ART_FILE: Record<RegionKey, string> = {
  west: "west.jpg",
  east: "east.jpg",
  central: "central.jpg",
  north: "north.jpg",
  south: "south.jpg",
};

type RevealServices = {
  royalRevealEnabled?: boolean;
  now: () => number;
  repository: PaidRepository;
  kv: KvStore;
  assets?: { fetch(request: Request): Promise<Response> };
};

const FILE_NAMES: Record<string, RevealFile> = {
  "card.png": "card",
  "story.png": "story",
  "decree.pdf": "pdf",
  "bundle.zip": "zip",
};

function enabled(services: RevealServices): void {
  if (!services.royalRevealEnabled) throw new PaidError("royal_reveal_unavailable", 404);
}

async function openReveal(services: RevealServices, token: string): Promise<RoyalRevealRecord> {
  enabled(services);
  if (!TOKEN.test(token)) throw new PaidError("reveal_not_found", 404);
  const reveal = await services.repository.getRevealByToken(token);
  if (!reveal) throw new PaidError("reveal_not_found", 404);
  const order = await services.repository.getById(reveal.orderId);
  const entitlement = await services.repository.entitlementForOrder(reveal.orderId);
  if (!order || order.state !== "fulfilled" || order.playerId !== reveal.playerId || order.productKey !== "royal_reveal_v1") {
    throw new PaidError("reveal_not_found", 404);
  }
  if (!entitlement || entitlement.state !== "active" || entitlement.remaining < 1 || entitlement.productKey !== "royal_reveal_v1") {
    throw new PaidError("reveal_not_found", 404);
  }
  return reveal;
}

async function artwork(services: RevealServices, edition: RegionKey): Promise<string | null> {
  if (!services.assets) return null;
  try {
    const asset = await services.assets.fetch(new Request(new URL(`/share-art/${ART_FILE[edition]}`, CANONICAL_ORIGIN)));
    if (!asset.ok) return null;
    const bytes = new Uint8Array(await asset.arrayBuffer());
    if (bytes.length < 32) return null;
    let binary = "";
    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    }
    return `data:image/jpeg;base64,${btoa(binary)}`;
  } catch {
    return null;
  }
}

async function renderFile(services: RevealServices, reveal: RoyalRevealRecord, file: RevealFile): Promise<{ bytes: Uint8Array; cache: "hit" | "miss" }> {
  const cached = await readCachedReveal(services.kv, reveal.orderId, file);
  if (cached) return { bytes: cached, cache: "hit" };
  const edition = editionOf(reveal.edition);
  const facts = await factsForReveal(edition, reveal.score, reveal.certificate);
  if (facts.length < 3) throw new PaidError("reveal_unavailable", 503);
  let bytes: Uint8Array;
  if (file === "pdf") {
    bytes = royalDecreePdf({ displayName: reveal.displayName, edition, score: reveal.score, certificate: reveal.certificate, facts });
  } else if (file === "zip") {
    const card = await renderFile(services, reveal, "card");
    const story = await renderFile(services, reveal, "story");
    const pdf = await renderFile(services, reveal, "pdf");
    bytes = zipStored([
      { name: "royal-decree-1080x1350.png", bytes: card.bytes },
      { name: "royal-decree-1080x1920.png", bytes: story.bytes },
      { name: "royal-decree.pdf", bytes: pdf.bytes },
    ], reveal.createdAt);
  } else {
    const svg = royalDecreeSvg({
      edition,
      score: reveal.score,
      displayName: reveal.displayName,
      certificate: reveal.certificate,
      frame: file === "story" ? "story" : "card",
      artwork: await artwork(services, edition),
    });
    bytes = await renderShareCardPng(svg);
  }
  await storeCachedReveal(services.kv, reveal.orderId, file, bytes);
  return { bytes, cache: "miss" };
}

function fileResponse(file: RevealFile, bytes: Uint8Array, cache: "hit" | "miss"): Response {
  const type = file === "pdf" ? "application/pdf" : file === "zip" ? "application/zip" : "image/png";
  const filename = file === "pdf" ? "royal-decree.pdf" : file === "zip" ? "royal-reveal-bundle.zip" : file === "story" ? "royal-decree-1080x1920.png" : "royal-decree-1080x1350.png";
  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: {
      "content-type": type,
      "content-disposition": `${file === "card" || file === "story" ? "inline" : "attachment"}; filename="${filename}"`,
      "cache-control": "private, no-store",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "x-royal-cache": cache,
    },
  });
}

export async function handleRoyalFile(token: string, name: string, services: RevealServices): Promise<Response> {
  const file = FILE_NAMES[name];
  if (!file) throw new PaidError("reveal_not_found", 404);
  const reveal = await openReveal(services, token);
  const rendered = await renderFile(services, reveal, file);
  return fileResponse(file, rendered.bytes, rendered.cache);
}

export async function handleRoyalClaim(body: Record<string, unknown>, services: RevealServices): Promise<Response> {
  enabled(services);
  if (typeof body.playerId !== "string" || !PLAYER_ID.test(body.playerId)) throw new PaidError("player_invalid", 400);
  if (typeof body.orderId !== "string" || !ORDER_ID.test(body.orderId)) throw new PaidError("order_unavailable", 404);
  const reveal = await services.repository.getRevealByOrder(body.orderId);
  if (!reveal || reveal.playerId !== body.playerId) throw new PaidError("reveal_not_found", 404);
  await openReveal(services, reveal.token);
  const edition = editionOf(reveal.edition);
  const facts = await factsForReveal(edition, reveal.score, reveal.certificate);
  const tier = resultTier(reveal.score);
  const base = `/api/paid/royal-reveal/${reveal.token}`;
  return Response.json({
    orderId: reveal.orderId,
    certificate: reveal.certificate,
    displayName: reveal.displayName,
    edition: reveal.edition,
    score: reveal.score,
    tier: tier.title,
    bridePrice: tier.cowries,
    explanation: tierExplanation({ displayName: reveal.displayName, edition, score: reveal.score, factCount: facts.length }),
    facts,
    downloads: {
      card: `${base}/card.png`,
      story: `${base}/story.png`,
      pdf: `${base}/decree.pdf`,
      zip: `${base}/bundle.zip`,
    },
  }, { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}
