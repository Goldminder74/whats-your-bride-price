import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const projectRoot = resolve(import.meta.dirname, "..");
const clientRoot = resolve(projectRoot, "dist", "client");
const serverEntry = resolve(projectRoot, "dist", "server", "index.js");
const port = Number(process.env.WYBP_PREVIEW_PORT || 3100);
const hostname = process.env.WYBP_PREVIEW_HOST || "127.0.0.1";

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

async function findAsset(pathname) {
  const candidate = resolve(clientRoot, `.${decodeURIComponent(pathname)}`);
  if (candidate !== clientRoot && !candidate.startsWith(`${clientRoot}${sep}`)) return null;
  try {
    if ((await stat(candidate)).isFile()) return candidate;
  } catch {
    return null;
  }
  return null;
}

async function assetResponse(request) {
  const assetPath = await findAsset(new URL(request.url).pathname);
  if (!assetPath) return new Response("Not found", { status: 404 });
  return new Response(await readFile(assetPath), {
    headers: { "content-type": mimeTypes.get(extname(assetPath)) || "application/octet-stream" },
  });
}

const workerUrl = pathToFileURL(serverEntry);
workerUrl.searchParams.set("preview", String(Date.now()));
const { default: worker } = await import(workerUrl.href);

const server = createServer(async (incoming, outgoing) => {
  try {
    const requestUrl = new URL(incoming.url || "/", `http://${incoming.headers.host || `${hostname}:${port}`}`);
    if (incoming.method === "POST" && requestUrl.pathname === "/__preview__/shutdown") {
      outgoing.writeHead(204);
      outgoing.end();
      setImmediate(stop);
      return;
    }
    const directAsset = await findAsset(requestUrl.pathname);
    const response = directAsset
      ? await assetResponse(new Request(requestUrl))
      : await worker.fetch(
          new Request(requestUrl, { method: incoming.method, headers: incoming.headers }),
          { ASSETS: { fetch: assetResponse } },
          { waitUntil() {}, passThroughOnException() {} },
        );

    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    if (incoming.method === "HEAD" || !response.body) {
      outgoing.end();
      return;
    }
    for await (const chunk of response.body) outgoing.write(Buffer.from(chunk));
    outgoing.end();
  } catch {
    outgoing.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    outgoing.end("Preview server error");
  }
});

function stop() {
  server.close(() => process.exit(0));
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
server.listen(port, hostname, () => {
  console.log(`Review preview ready at http://${hostname}:${port}`);
});
