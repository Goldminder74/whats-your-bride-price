import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const publicRoot = new URL("../../public/", import.meta.url);
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function readPublicAsset(pathname) {
  assert.match(pathname, /^\/[a-z0-9][a-z0-9./-]*$/i);
  return readFile(new URL(pathname.slice(1), publicRoot));
}

function readPngDimensions(buffer) {
  assert.equal(buffer.subarray(0, 8).compare(pngSignature), 0, "asset must have a PNG signature");
  assert.equal(buffer.subarray(12, 16).toString("ascii"), "IHDR");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function readIcoSizes(buffer) {
  assert.equal(buffer.readUInt16LE(0), 0, "ICO reserved field must be zero");
  assert.equal(buffer.readUInt16LE(2), 1, "ICO type must identify an icon");
  const count = buffer.readUInt16LE(4);
  const sizes = [];
  for (let index = 0; index < count; index += 1) {
    const offset = 6 + index * 16;
    sizes.push({
      width: buffer[offset] || 256,
      height: buffer[offset + 1] || 256,
      bitDepth: buffer.readUInt16LE(offset + 6),
    });
  }
  return sizes;
}

test("standard PNG application icons have the required MIME signature and dimensions", async () => {
  const expected = new Map([
    ["/apple-touch-icon.png", 180],
    ["/icon-192.png", 192],
    ["/icon-512.png", 512],
    ["/icon-maskable-192.png", 192],
    ["/icon-maskable-512.png", 512],
  ]);
  for (const [pathname, size] of expected) {
    const dimensions = readPngDimensions(await readPublicAsset(pathname));
    assert.deepEqual(dimensions, { width: size, height: size }, pathname);
  }
});

test("favicon SVG is a self-contained, text-free cowrie emblem", async () => {
  const svg = (await readPublicAsset("/favicon.svg")).toString("utf8");
  assert.match(svg, /^<svg\b[^>]*viewBox="0 0 64 64"/);
  assert.match(svg, /Cowrie shell emblem/);
  assert.doesNotMatch(svg, /<text\b|(?:href|src)=["']https?:|chatgpt|ayo43077/i);
});

test("favicon ICO contains 16, 32 and 48 pixel 32-bit images", async () => {
  const sizes = readIcoSizes(await readPublicAsset("/favicon.ico"));
  assert.deepEqual(sizes, [
    { width: 16, height: 16, bitDepth: 32 },
    { width: 32, height: 32, bitDepth: 32 },
    { width: 48, height: 48, bitDepth: 32 },
  ]);
});

test("manifest preserves install behaviour and declares standard and maskable icon sizes", async () => {
  const source = (await readPublicAsset("/manifest.webmanifest")).toString("utf8");
  const manifest = JSON.parse(source);
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.orientation, "portrait-primary");
  assert.deepEqual(manifest.icons, [
    { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
    { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ]);
  for (const icon of manifest.icons) await readPublicAsset(icon.src);
  assert.doesNotMatch(source, /chatgpt|ayo43077/i);
});
