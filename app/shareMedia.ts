import { isApprovedAvatarId, resolveApprovedAvatar } from "./avatarRegistry.ts";
import { validateDisplayName } from "./displayNames.ts";
import { regions, type RegionKey } from "./gameData.ts";
import { PRODUCT_SAFEGUARD, RESULT_TIER_TITLES } from "./productSafeguards.ts";
import { calculateResultTier } from "./gameLogic.ts";
import type { SafeShareProjection } from "./shareProjection.ts";

export const SHARE_MEDIA_WIDTH = 1080;
export const SHARE_MEDIA_HEIGHT = 1920;
export const SHARE_MEDIA_MIME = "image/png";
export const SHARE_MEDIA_SAFE_INSET = 96;

export type ShareMediaCard = Readonly<{
  edition: RegionKey;
  displayName: string;
  score: number;
  maximumScore: number;
  resultTitle: string;
  avatarId: string;
  portraitUrl?: string | null;
}>;

export type PreparedShareMedia = Readonly<{
  blob: Blob;
  file: File;
  width: typeof SHARE_MEDIA_WIDTH;
  height: typeof SHARE_MEDIA_HEIGHT;
  mimeType: typeof SHARE_MEDIA_MIME;
  filename: string;
}>;

function safeCard(card: ShareMediaCard): ShareMediaCard {
  const region = regions[card.edition];
  const name = validateDisplayName(card.displayName);
  if (
    !region
    || !name.valid
    || !name.value
    || !Number.isInteger(card.score)
    || card.maximumScore !== region.questions.length
    || card.score < 0
    || card.score > card.maximumScore
    || card.resultTitle !== RESULT_TIER_TITLES[calculateResultTier(card.score)]
    || !isApprovedAvatarId(card.avatarId)
    || (card.portraitUrl !== undefined && card.portraitUrl !== null && typeof card.portraitUrl !== "string")
  ) throw new Error("unsafe_share_media_card");
  return Object.freeze({ ...card, displayName: name.value });
}

export function shareMediaCardFromProjection(projection: SafeShareProjection): ShareMediaCard | null {
  if (
    !projection.personalised
    || projection.displayName === null
    || projection.score === null
    || projection.resultTitle === null
    || projection.avatarId === null
  ) return null;
  return safeCard({
    edition: projection.edition,
    displayName: projection.displayName,
    score: projection.score,
    maximumScore: projection.maximumScore,
    resultTitle: projection.resultTitle,
    avatarId: projection.avatarId,
  });
}

export function shareMediaFilename(edition: RegionKey): string {
  return `bride-price-${edition}-story.png`;
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("share_media_image_failed"));
    image.src = source;
  });
}

function coverImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  context.drawImage(
    image,
    (image.naturalWidth - sourceWidth) / 2,
    (image.naturalHeight - sourceHeight) / 2,
    sourceWidth,
    sourceHeight,
    x,
    y,
    width,
    height,
  );
}

function fitText(context: CanvasRenderingContext2D, text: string, maximumWidth: number): string {
  if (context.measureText(text).width <= maximumWidth) return text;
  let shortened = text;
  while (shortened.length > 1 && context.measureText(`${shortened}…`).width > maximumWidth) shortened = shortened.slice(0, -1);
  return `${shortened}…`;
}

export async function prepareShareMedia(card: ShareMediaCard): Promise<PreparedShareMedia> {
  const safe = safeCard(card);
  const region = regions[safe.edition];
  const [base, accent, dark] = region.palette;
  const artworkName = safe.edition === "south" ? "southern" : safe.edition;
  const portraitSource = safe.portraitUrl || resolveApprovedAvatar(safe.avatarId).src;
  const [worldArt, portrait] = await Promise.all([
    loadImage(`/regions/${artworkName}-africa.webp`),
    loadImage(portraitSource),
  ]);
  const canvas = document.createElement("canvas");
  canvas.width = SHARE_MEDIA_WIDTH;
  canvas.height = SHARE_MEDIA_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("share_media_canvas_unavailable");

  context.fillStyle = base;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.globalAlpha = 0.6;
  coverImage(context, worldArt, 0, 0, canvas.width, canvas.height);
  context.restore();
  const veil = context.createLinearGradient(0, 0, 0, canvas.height);
  veil.addColorStop(0, `${dark}77`);
  veil.addColorStop(0.44, `${dark}dd`);
  veil.addColorStop(1, dark);
  context.fillStyle = veil;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.globalAlpha = 0.2;
  context.strokeStyle = accent;
  context.lineWidth = 12;
  for (let x = -900; x < 1700; x += 120) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x + 980, canvas.height);
    context.stroke();
  }
  context.globalAlpha = 1;

  context.fillStyle = `${dark}ee`;
  context.fillRect(SHARE_MEDIA_SAFE_INSET, SHARE_MEDIA_SAFE_INSET, canvas.width - SHARE_MEDIA_SAFE_INSET * 2, canvas.height - SHARE_MEDIA_SAFE_INSET * 2);
  context.strokeStyle = accent;
  context.lineWidth = 4;
  context.strokeRect(SHARE_MEDIA_SAFE_INSET + 22, SHARE_MEDIA_SAFE_INSET + 22, canvas.width - (SHARE_MEDIA_SAFE_INSET + 22) * 2, canvas.height - (SHARE_MEDIA_SAFE_INSET + 22) * 2);

  context.textAlign = "center";
  context.fillStyle = accent;
  context.font = "700 28px Arial";
  context.fillText(`${region.name.toUpperCase()} EDITION  •  CULTURE SCORECARD`, 540, 190);
  context.font = "900 88px Georgia";
  context.fillText(region.mark, 540, 300);

  context.save();
  context.beginPath();
  context.arc(540, 610, 245, 0, Math.PI * 2);
  context.clip();
  coverImage(context, portrait, 295, 365, 490, 490);
  context.restore();
  context.strokeStyle = accent;
  context.lineWidth = 16;
  context.beginPath();
  context.arc(540, 610, 254, 0, Math.PI * 2);
  context.stroke();

  context.fillStyle = "#f8edda";
  context.font = "italic 54px Georgia";
  context.fillText(fitText(context, safe.displayName, 820), 540, 970);
  context.fillStyle = accent;
  context.font = "900 80px Impact, Arial Black, Arial";
  context.fillText(fitText(context, safe.resultTitle.toUpperCase(), 850), 540, 1080);

  context.fillStyle = "#f8edda";
  context.font = "900 190px Impact, Arial Black, Arial";
  context.fillText(`${safe.score}/${safe.maximumScore}`, 540, 1300);
  context.fillStyle = accent;
  context.font = "700 29px Arial";
  context.fillText("KNOWLEDGE SCORE", 540, 1360);

  context.fillStyle = "#f8edda";
  context.font = "900 62px Impact, Arial Black, Arial";
  context.fillText("WHAT’S YOUR BRIDE PRICE?", 540, 1510);
  context.font = "28px Arial";
  context.fillText("Play your region. Share your result. Pass the challenge on.", 540, 1575);

  context.fillStyle = accent;
  context.font = "700 24px Arial";
  context.fillText(PRODUCT_SAFEGUARD, 540, 1718);
  context.fillStyle = "#f8edda";
  context.font = "22px Arial";
  context.fillText("brideprice.classesforculture.com", 540, 1780);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, SHARE_MEDIA_MIME));
  if (!blob || blob.type !== SHARE_MEDIA_MIME) throw new Error("share_media_encoding_failed");
  const filename = shareMediaFilename(safe.edition);
  const file = new File([blob], filename, { type: SHARE_MEDIA_MIME, lastModified: Date.now() });
  return Object.freeze({ blob, file, width: SHARE_MEDIA_WIDTH, height: SHARE_MEDIA_HEIGHT, mimeType: SHARE_MEDIA_MIME, filename });
}

export function downloadPreparedShareMedia(media: PreparedShareMedia): void {
  const url = URL.createObjectURL(media.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = media.filename;
  anchor.rel = "noopener";
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
