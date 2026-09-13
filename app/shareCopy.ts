import { PRODUCT_SAFEGUARD } from "./productSafeguards.ts";
import type { SafeShareProjection } from "./shareProjection.ts";

export const shareCopyVariant = "share-centre-v1" as const;
export const shareCopyMaximumLength = 700;

export type ShareCopy = Readonly<{
  title: string;
  sentence: string;
  completeText: string;
}>;

export function buildShareCopy(projection: SafeShareProjection): ShareCopy {
  const publishedResult = projection.personalised && new URL(projection.canonicalUrl).pathname.startsWith("/result/");
  const title = publishedResult ? "A culture score just landed!" : projection.personalised ? "You’ve been challenged!" : "Play the culture challenge!";
  const sentence = publishedResult
    ? `${projection.displayName} scored ${projection.score}/${projection.maximumScore} in the ${projection.editionLabel} Edition and earned ${projection.resultTitle}. Can you beat this culture score?`
    : projection.personalised
      ? `${projection.displayName} challenged you to beat ${projection.score}/${projection.maximumScore} in the ${projection.editionLabel} Edition. Can you protect the family reputation?`
    : `You have been invited to play the ${projection.editionLabel} Edition of What’s Your Bride Price? Bring your culture knowledge.`;
  const completeText = `${sentence}\n${PRODUCT_SAFEGUARD}\n${projection.canonicalUrl}`;
  if (completeText.length > shareCopyMaximumLength) throw new Error("share_copy_too_long");
  return Object.freeze({ title, sentence, completeText });
}

export function whatsappShareDestination(copy: ShareCopy): string {
  const destination = new URL("https://wa.me/");
  destination.searchParams.set("text", copy.completeText);
  return destination.toString();
}

export function facebookShareDestination(projection: SafeShareProjection): string {
  const destination = new URL("https://www.facebook.com/sharer/sharer.php");
  destination.searchParams.set("u", projection.canonicalUrl);
  return destination.toString();
}

export function countTextOccurrences(value: string, needle: string): number {
  if (!needle) return 0;
  return value.split(needle).length - 1;
}
