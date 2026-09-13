export const privatePhotoLimits = Object.freeze({
  maximumInputBytes: 8 * 1024 * 1024,
  maximumInputSide: 6_000,
  maximumInputPixels: 24_000_000,
  maximumOutputSide: 1_600,
  maximumOutputBytes: 3 * 1024 * 1024,
  outputMimeType: "image/jpeg" as const,
  outputQuality: 0.9,
  lifetimeMs: 30 * 60 * 1000,
});

export type ApprovedPhotoMime = "image/jpeg" | "image/png" | "image/webp";
export type PhotoInspection = Readonly<{
  mimeType: ApprovedPhotoMime;
  width: number;
  height: number;
  orientation: number;
}>;

export type SanitizedPrivatePhoto = Readonly<{
  blob: Blob;
  width: number;
  height: number;
  mimeType: "image/jpeg";
  quality: number;
  expiresAt: number;
}>;

export type PrivatePhotoErrorCode =
  | "unsupported_type"
  | "type_mismatch"
  | "unsafe_content"
  | "too_large"
  | "dimensions_too_large"
  | "malformed"
  | "processing_failed"
  | "cancelled";

export class PrivatePhotoError extends Error {
  readonly code: PrivatePhotoErrorCode;
  constructor(code: PrivatePhotoErrorCode, message: string) {
    super(message);
    this.name = "PrivatePhotoError";
    this.code = code;
  }
}

export function privatePhotoFriendlyMessage(error: unknown): string {
  const code = error instanceof PrivatePhotoError ? error.code : "processing_failed";
  if (code === "too_large") return "That photo is over 8 MB. Choose a smaller JPEG, PNG or WebP image.";
  if (code === "dimensions_too_large") return "That photo is too large to process safely. Choose one under 6,000 pixels per side and 24 megapixels.";
  if (code === "unsupported_type" || code === "type_mismatch" || code === "unsafe_content") return "Choose a genuine JPEG, PNG or WebP photo. SVG, GIF, HEIC and mismatched files are not accepted.";
  if (code === "cancelled") return "Photo processing was cancelled. Your avatar is still ready.";
  return "That photo could not be processed safely. Your avatar is still ready.";
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] * 0x1000000) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0;
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] + (bytes[offset + 1] << 8) + (bytes[offset + 2] << 16) + (bytes[offset + 3] * 0x1000000)) >>> 0;
}

function readUint16(bytes: Uint8Array, offset: number, littleEndian: boolean): number {
  return littleEndian ? bytes[offset] | (bytes[offset + 1] << 8) : (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint32(bytes: Uint8Array, offset: number, littleEndian: boolean): number {
  return littleEndian ? readUint32LE(bytes, offset) : readUint32BE(bytes, offset);
}

function jpegOrientation(bytes: Uint8Array, offset: number, length: number): number {
  if (length < 14 || String.fromCharCode(...bytes.slice(offset, offset + 6)) !== "Exif\u0000\u0000") return 1;
  const tiff = offset + 6;
  const littleEndian = bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49;
  if (!littleEndian && !(bytes[tiff] === 0x4d && bytes[tiff + 1] === 0x4d)) return 1;
  if (readUint16(bytes, tiff + 2, littleEndian) !== 42) return 1;
  const ifdOffset = readUint32(bytes, tiff + 4, littleEndian);
  const ifd = tiff + ifdOffset;
  if (ifd + 2 > offset + length) return 1;
  const entries = readUint16(bytes, ifd, littleEndian);
  for (let index = 0; index < entries; index += 1) {
    const entry = ifd + 2 + index * 12;
    if (entry + 12 > offset + length) return 1;
    if (readUint16(bytes, entry, littleEndian) === 0x0112) {
      const value = readUint16(bytes, entry + 8, littleEndian);
      return value >= 1 && value <= 8 ? value : 1;
    }
  }
  return 1;
}

function inspectJpeg(bytes: Uint8Array): PhotoInspection {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) {
    throw new PrivatePhotoError("type_mismatch", "JPEG signature mismatch");
  }
  let offset = 2;
  let width = 0;
  let height = 0;
  let orientation = 1;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) break;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) throw new PrivatePhotoError("malformed", "Malformed JPEG segment");
    if (marker === 0xe1) orientation = jpegOrientation(bytes, offset + 2, length - 2);
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      if (length < 7) throw new PrivatePhotoError("malformed", "Malformed JPEG dimensions");
      height = (bytes[offset + 3] << 8) | bytes[offset + 4];
      width = (bytes[offset + 5] << 8) | bytes[offset + 6];
    }
    offset += length;
  }
  if (!width || !height) throw new PrivatePhotoError("malformed", "JPEG dimensions are unavailable");
  return Object.freeze({ mimeType: "image/jpeg", width, height, orientation });
}

function inspectPng(bytes: Uint8Array): PhotoInspection {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 8 || !signature.every((value, index) => bytes[index] === value)) throw new PrivatePhotoError("type_mismatch", "PNG signature mismatch");
  if (bytes.length < 33) throw new PrivatePhotoError("malformed", "PNG header is truncated");
  if (readUint32BE(bytes, 8) !== 13 || String.fromCharCode(...bytes.slice(12, 16)) !== "IHDR") throw new PrivatePhotoError("malformed", "PNG header is malformed");
  let offset = 8;
  let foundEnd = false;
  while (offset + 12 <= bytes.length) {
    const length = readUint32BE(bytes, offset);
    const end = offset + 12 + length;
    if (end > bytes.length) throw new PrivatePhotoError("malformed", "PNG chunk is truncated");
    const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
    if (type === "IEND") {
      if (length !== 0 || end !== bytes.length) throw new PrivatePhotoError("unsafe_content", "PNG has trailing or malformed content");
      foundEnd = true;
      break;
    }
    offset = end;
  }
  if (!foundEnd) throw new PrivatePhotoError("malformed", "PNG end marker is missing");
  return Object.freeze({ mimeType: "image/png", width: readUint32BE(bytes, 16), height: readUint32BE(bytes, 20), orientation: 1 });
}

function inspectWebp(bytes: Uint8Array): PhotoInspection {
  if (bytes.length < 30 || String.fromCharCode(...bytes.slice(0, 4)) !== "RIFF" || String.fromCharCode(...bytes.slice(8, 12)) !== "WEBP") {
    throw new PrivatePhotoError("type_mismatch", "WebP signature mismatch");
  }
  if (readUint32LE(bytes, 4) + 8 !== bytes.length) throw new PrivatePhotoError("unsafe_content", "WebP container length mismatch");
  const chunk = String.fromCharCode(...bytes.slice(12, 16));
  let width = 0;
  let height = 0;
  if (chunk === "VP8X") {
    width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
    height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
  } else if (chunk === "VP8L" && bytes[20] === 0x2f) {
    const bits = readUint32LE(bytes, 21);
    width = (bits & 0x3fff) + 1;
    height = ((bits >> 14) & 0x3fff) + 1;
  } else if (chunk === "VP8 " && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    width = (bytes[26] | (bytes[27] << 8)) & 0x3fff;
    height = (bytes[28] | (bytes[29] << 8)) & 0x3fff;
  }
  if (!width || !height) throw new PrivatePhotoError("malformed", "WebP dimensions are unavailable");
  return Object.freeze({ mimeType: "image/webp", width, height, orientation: 1 });
}

function fileExtension(name: string): string {
  const match = /\.([^.]+)$/.exec(name.toLowerCase());
  return match?.[1] || "";
}

function expectedExtensions(type: ApprovedPhotoMime): readonly string[] {
  if (type === "image/jpeg") return ["jpg", "jpeg"];
  if (type === "image/png") return ["png"];
  return ["webp"];
}

function detectUnsafeText(bytes: Uint8Array): boolean {
  const sample = new TextDecoder("latin1").decode(bytes.slice(0, Math.min(bytes.length, 16_384))).toLowerCase();
  return ["<svg", "<script", "<?xml", "javascript:"].some((marker) => sample.includes(marker));
}

export function inspectPrivatePhotoBytes(input: {
  bytes: Uint8Array;
  declaredMimeType: string;
  originalName: string;
}): PhotoInspection {
  const { bytes, declaredMimeType, originalName } = input;
  if (bytes.byteLength > privatePhotoLimits.maximumInputBytes) throw new PrivatePhotoError("too_large", "Input exceeds byte limit");
  if (!(["image/jpeg", "image/png", "image/webp"] as string[]).includes(declaredMimeType)) throw new PrivatePhotoError("unsupported_type", "Unsupported declared MIME type");
  const mimeType = declaredMimeType as ApprovedPhotoMime;
  if (!expectedExtensions(mimeType).includes(fileExtension(originalName))) throw new PrivatePhotoError("type_mismatch", "File extension does not match declared MIME type");
  if (detectUnsafeText(bytes)) throw new PrivatePhotoError("unsafe_content", "Active-content marker found in image container");
  const inspection = mimeType === "image/jpeg" ? inspectJpeg(bytes) : mimeType === "image/png" ? inspectPng(bytes) : inspectWebp(bytes);
  if (inspection.mimeType !== mimeType) throw new PrivatePhotoError("type_mismatch", "Binary signature does not match declared MIME type");
  if (
    inspection.width > privatePhotoLimits.maximumInputSide
    || inspection.height > privatePhotoLimits.maximumInputSide
    || inspection.width * inspection.height > privatePhotoLimits.maximumInputPixels
  ) throw new PrivatePhotoError("dimensions_too_large", "Input dimensions exceed safety limit");
  return inspection;
}

export function orientedDimensions(width: number, height: number, orientation: number): { width: number; height: number } {
  return orientation >= 5 && orientation <= 8 ? { width: height, height: width } : { width, height };
}

export function outputDimensions(width: number, height: number, maximumSide = privatePhotoLimits.maximumOutputSide): { width: number; height: number } {
  const scale = Math.min(1, maximumSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function applyOrientationTransform(context: CanvasRenderingContext2D, orientation: number, width: number, height: number): void {
  if (orientation === 2) context.transform(-1, 0, 0, 1, width, 0);
  else if (orientation === 3) context.transform(-1, 0, 0, -1, width, height);
  else if (orientation === 4) context.transform(1, 0, 0, -1, 0, height);
  else if (orientation === 5) context.transform(0, 1, 1, 0, 0, 0);
  else if (orientation === 6) context.transform(0, 1, -1, 0, height, 0);
  else if (orientation === 7) context.transform(0, -1, -1, 0, height, width);
  else if (orientation === 8) context.transform(0, -1, 1, 0, 0, width);
}

export function sanitizedOutputContainsMetadataMarkers(bytes: Uint8Array): boolean {
  const decoded = new TextDecoder("latin1").decode(bytes);
  return ["Exif\u0000\u0000", "GPSLatitude", "GPSLongitude", "EXIF_TEST_MARKER", "GPS_TEST_MARKER", "Comment"].some((marker) => decoded.includes(marker));
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new PrivatePhotoError("processing_failed", "Canvas encoding failed")), type, quality));
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new PrivatePhotoError("cancelled", "Photo processing was cancelled");
}

export async function sanitizePrivatePhoto(file: File, options: { signal?: AbortSignal; now?: number } = {}): Promise<SanitizedPrivatePhoto> {
  throwIfAborted(options.signal);
  if (file.size > privatePhotoLimits.maximumInputBytes) throw new PrivatePhotoError("too_large", "Input exceeds byte limit");
  const bytes = new Uint8Array(await file.arrayBuffer());
  throwIfAborted(options.signal);
  const inspection = inspectPrivatePhotoBytes({ bytes, declaredMimeType: file.type, originalName: file.name });
  const sourceBlob = new Blob([bytes], { type: inspection.mimeType });
  let bitmap: ImageBitmap | null = null;
  let fallbackImage: HTMLImageElement | null = null;
  let originalUrl: string | null = null;
  let canvas: HTMLCanvasElement | null = null;
  try {
    let source: CanvasImageSource;
    let sourceWidth: number;
    let sourceHeight: number;
    let applySourceOrientation = false;
    if (typeof createImageBitmap === "function") {
      bitmap = await createImageBitmap(sourceBlob, { imageOrientation: "none" });
      source = bitmap;
      sourceWidth = inspection.width;
      sourceHeight = inspection.height;
      applySourceOrientation = true;
    } else {
      originalUrl = URL.createObjectURL(sourceBlob);
      fallbackImage = new Image();
      fallbackImage.src = originalUrl;
      await fallbackImage.decode();
      source = fallbackImage;
      sourceWidth = fallbackImage.naturalWidth;
      sourceHeight = fallbackImage.naturalHeight;
    }
    throwIfAborted(options.signal);
    if (!sourceWidth || !sourceHeight) throw new PrivatePhotoError("malformed", "Browser decoder returned no dimensions");
    const oriented = applySourceOrientation
      ? orientedDimensions(inspection.width, inspection.height, inspection.orientation)
      : { width: sourceWidth, height: sourceHeight };
    const target = outputDimensions(oriented.width, oriented.height);
    canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new PrivatePhotoError("processing_failed", "Canvas is unavailable");
    context.fillStyle = "#20120d";
    context.fillRect(0, 0, target.width, target.height);
    context.save();
    if (applySourceOrientation) {
      const scaleX = target.width / oriented.width;
      const scaleY = target.height / oriented.height;
      context.scale(scaleX, scaleY);
      applyOrientationTransform(context, inspection.orientation, inspection.width, inspection.height);
      context.drawImage(source, 0, 0, inspection.width, inspection.height);
    } else {
      context.drawImage(source, 0, 0, sourceWidth, sourceHeight, 0, 0, target.width, target.height);
    }
    context.restore();
    throwIfAborted(options.signal);
    const blob = await canvasToBlob(canvas, privatePhotoLimits.outputMimeType, privatePhotoLimits.outputQuality);
    throwIfAborted(options.signal);
    if (blob.type !== privatePhotoLimits.outputMimeType || blob.size > privatePhotoLimits.maximumOutputBytes) {
      throw new PrivatePhotoError("processing_failed", "Sanitized output exceeds safety contract");
    }
    const outputBytes = new Uint8Array(await blob.arrayBuffer());
    if (sanitizedOutputContainsMetadataMarkers(outputBytes)) throw new PrivatePhotoError("processing_failed", "Sanitized output retained metadata marker");
    return Object.freeze({
      blob,
      width: target.width,
      height: target.height,
      mimeType: "image/jpeg",
      quality: privatePhotoLimits.outputQuality,
      expiresAt: (options.now ?? Date.now()) + privatePhotoLimits.lifetimeMs,
    });
  } catch (error) {
    if (error instanceof PrivatePhotoError) throw error;
    throw new PrivatePhotoError("processing_failed", "Browser image processing failed");
  } finally {
    bitmap?.close();
    if (fallbackImage) fallbackImage.src = "";
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}
