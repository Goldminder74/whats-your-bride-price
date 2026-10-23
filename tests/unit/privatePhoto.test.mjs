import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PrivatePhotoError,
  applyOrientationTransform,
  inspectPrivatePhotoBytes,
  orientedDimensions,
  outputDimensions,
  privatePhotoLimits,
  sanitizePrivatePhoto,
  sanitizedOutputContainsMetadataMarkers,
} from "../../app/privatePhoto.ts";

const tinyPng = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"));

function webp(width = 1, height = 1) {
  const bytes = new Uint8Array(30);
  bytes.set(Buffer.from("RIFF"), 0);
  new DataView(bytes.buffer).setUint32(4, 22, true);
  bytes.set(Buffer.from("WEBPVP8X"), 8);
  new DataView(bytes.buffer).setUint32(16, 10, true);
  const view = new DataView(bytes.buffer);
  view.setUint8(24, (width - 1) & 255); view.setUint8(25, ((width - 1) >> 8) & 255); view.setUint8(26, ((width - 1) >> 16) & 255);
  view.setUint8(27, (height - 1) & 255); view.setUint8(28, ((height - 1) >> 8) & 255); view.setUint8(29, ((height - 1) >> 16) & 255);
  return bytes;
}

function jpeg(width = 1, height = 1, orientation = 1) {
  const exif = orientation === 1 ? [] : [
    0xff, 0xe1, 0x00, 0x22,
    0x45, 0x78, 0x69, 0x66, 0, 0,
    0x49, 0x49, 0x2a, 0, 8, 0, 0, 0,
    1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, orientation, 0, 0, 0,
    0, 0, 0, 0,
  ];
  return Uint8Array.from([
    0xff, 0xd8, ...exif,
    0xff, 0xc0, 0x00, 0x0b, 8, (height >> 8) & 255, height & 255, (width >> 8) & 255, width & 255, 1, 1, 0x11, 0,
    0xff, 0xd9,
  ]);
}

function assertPhotoError(code, callback) {
  assert.throws(callback, (error) => error instanceof PrivatePhotoError && error.code === code);
}

test("validates JPEG, PNG and WebP signatures and dimensions", () => {
  assert.deepEqual(inspectPrivatePhotoBytes({ bytes: tinyPng, declaredMimeType: "image/png", originalName: "portrait.png" }), { mimeType: "image/png", width: 1, height: 1, orientation: 1 });
  assert.deepEqual(inspectPrivatePhotoBytes({ bytes: jpeg(320, 240), declaredMimeType: "image/jpeg", originalName: "portrait.jpeg" }), { mimeType: "image/jpeg", width: 320, height: 240, orientation: 1 });
  assert.deepEqual(inspectPrivatePhotoBytes({ bytes: webp(640, 480), declaredMimeType: "image/webp", originalName: "portrait.webp" }), { mimeType: "image/webp", width: 640, height: 480, orientation: 1 });
});

test("rejects forged declarations, unsupported active formats and polyglot markers", () => {
  assertPhotoError("type_mismatch", () => inspectPrivatePhotoBytes({ bytes: tinyPng, declaredMimeType: "image/jpeg", originalName: "portrait.jpg" }));
  assertPhotoError("type_mismatch", () => inspectPrivatePhotoBytes({ bytes: tinyPng, declaredMimeType: "image/png", originalName: "portrait.jpg" }));
  assertPhotoError("unsupported_type", () => inspectPrivatePhotoBytes({ bytes: Buffer.from("<svg></svg>"), declaredMimeType: "image/svg+xml", originalName: "portrait.svg" }));
  assertPhotoError("unsupported_type", () => inspectPrivatePhotoBytes({ bytes: Buffer.from("GIF89a"), declaredMimeType: "image/gif", originalName: "portrait.gif" }));
  const polyglot = Uint8Array.from([...jpeg(), ...Buffer.from("<script>alert(1)</script>")]);
  assertPhotoError("unsafe_content", () => inspectPrivatePhotoBytes({ bytes: polyglot, declaredMimeType: "image/jpeg", originalName: "portrait.jpg" }));
});

test("rejects oversized, excessive-dimension and malformed input before decode", () => {
  assertPhotoError("too_large", () => inspectPrivatePhotoBytes({ bytes: new Uint8Array(privatePhotoLimits.maximumInputBytes + 1), declaredMimeType: "image/png", originalName: "portrait.png" }));
  assertPhotoError("dimensions_too_large", () => inspectPrivatePhotoBytes({ bytes: webp(6001, 1), declaredMimeType: "image/webp", originalName: "portrait.webp" }));
  assertPhotoError("dimensions_too_large", () => inspectPrivatePhotoBytes({ bytes: webp(6000, 5000), declaredMimeType: "image/webp", originalName: "portrait.webp" }));
  assertPhotoError("malformed", () => inspectPrivatePhotoBytes({ bytes: tinyPng.slice(0, 30), declaredMimeType: "image/png", originalName: "portrait.png" }));
});

test("reads orientation and computes bounded aspect-ratio preserving output", () => {
  const inspected = inspectPrivatePhotoBytes({ bytes: jpeg(1200, 800, 6), declaredMimeType: "image/jpeg", originalName: "portrait.jpg" });
  assert.equal(inspected.orientation, 6);
  assert.deepEqual(orientedDimensions(1200, 800, 6), { width: 800, height: 1200 });
  assert.deepEqual(outputDimensions(3200, 1600), { width: 1600, height: 800 });
  const calls = [];
  applyOrientationTransform({ transform: (...args) => calls.push(args) }, 6, 1200, 800);
  assert.deepEqual(calls, [[0, 1, -1, 0, 800, 0]]);
});

test("detects controlled EXIF, GPS and comment markers in output bytes", () => {
  assert.equal(sanitizedOutputContainsMetadataMarkers(Buffer.from("prefix Exif\0\0 GPSLatitude GPS_TEST_MARKER suffix")), true);
  assert.equal(sanitizedOutputContainsMetadataMarkers(Buffer.from("freshly encoded pixels only")), false);
});

test("sanitises to bounded JPEG, cancels stale work and revokes temporary URLs", async () => {
  const originals = {
    createImageBitmap: globalThis.createImageBitmap,
    Image: globalThis.Image,
    document: globalThis.document,
    createObjectURL: URL.createObjectURL,
    revokeObjectURL: URL.revokeObjectURL,
  };
  const revoked = [];
  let closed = 0;
  globalThis.createImageBitmap = async () => ({ width: 1, height: 1, close() { closed += 1; } });
  globalThis.document = {
    createElement() {
      return {
        width: 0,
        height: 0,
        getContext() { return { fillStyle: "", fillRect() {}, save() {}, restore() {}, scale() {}, transform() {}, drawImage() {} }; },
        toBlob(callback, type) { callback(new Blob([Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])], { type })); },
      };
    },
  };
  URL.createObjectURL = () => "blob:temporary-source";
  URL.revokeObjectURL = (url) => revoked.push(url);
  try {
    const result = await sanitizePrivatePhoto(new File([tinyPng], "portrait.png", { type: "image/png" }), { now: 100 });
    assert.equal(result.mimeType, "image/jpeg");
    assert.equal(result.quality, 0.9);
    assert.deepEqual({ width: result.width, height: result.height }, { width: 1, height: 1 });
    assert.ok(result.blob.size <= privatePhotoLimits.maximumOutputBytes);
    assert.equal(closed, 1);

    globalThis.createImageBitmap = undefined;
    globalThis.Image = class {
      naturalWidth = 1;
      naturalHeight = 1;
      src = "";
      async decode() {}
    };
    await sanitizePrivatePhoto(new File([tinyPng], "portrait.png", { type: "image/png" }), { now: 100 });
    assert.deepEqual(revoked, ["blob:temporary-source"]);

    const controller = new AbortController();
    const delayedFile = { size: tinyPng.length, type: "image/png", name: "portrait.png", async arrayBuffer() { controller.abort(); return tinyPng.buffer; } };
    await assert.rejects(sanitizePrivatePhoto(delayedFile, { signal: controller.signal }), (error) => error instanceof PrivatePhotoError && error.code === "cancelled");
  } finally {
    globalThis.createImageBitmap = originals.createImageBitmap;
    globalThis.Image = originals.Image;
    globalThis.document = originals.document;
    URL.createObjectURL = originals.createObjectURL;
    URL.revokeObjectURL = originals.revokeObjectURL;
  }
  assert.deepEqual(revoked, ["blob:temporary-source"]);
});
