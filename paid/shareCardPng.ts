import { readFile } from "node:fs/promises";
import { Resvg, initWasm } from "@resvg/resvg-wasm";

let ready: Promise<void> | null = null;
let font: Uint8Array | null = null;

async function loadWasm(): Promise<BufferSource> {
  try {
    return await readFile(new URL("../node_modules/@resvg/resvg-wasm/index_bg.wasm", import.meta.url));
  } catch {
    const wasm = await import("@resvg/resvg-wasm/index_bg.wasm");
    return (wasm.default ?? wasm) as BufferSource;
  }
}

async function loadAnton(): Promise<Uint8Array> {
  try {
    return new Uint8Array(await readFile(new URL("./fonts/Anton-Regular.ttf", import.meta.url)));
  } catch {
    const file = await import("./fonts/Anton-Regular.ttf");
    const data = (file.default ?? file) as ArrayBuffer | Uint8Array;
    return data instanceof Uint8Array ? data : new Uint8Array(data);
  }
}

async function ensureWasm(): Promise<void> {
  ready ??= (async () => {
    await initWasm(await loadWasm());
  })();
  return ready;
}

async function antonFont(): Promise<Uint8Array> {
  font ??= await loadAnton();
  return font;
}

export async function renderShareCardPng(svg: string): Promise<Uint8Array> {
  await ensureWasm();
  const resvg = new Resvg(svg, {
    fitTo: { mode: "original" },
    font: {
      fontBuffers: [await antonFont()],
      defaultFontFamily: "Anton",
      sansSerifFamily: "Anton",
      serifFamily: "Anton",
    },
    shapeRendering: 2,
    textRendering: 2,
  });
  try {
    return resvg.render().asPng();
  } finally {
    resvg.free();
  }
}

export function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}
