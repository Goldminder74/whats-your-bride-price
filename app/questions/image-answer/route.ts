import { judgeImageAnswer } from "../../imageAnswerAuthority.ts";

const maximumBodyBytes = 256;

function json(body: Readonly<Record<string, unknown>>, status: number): Response {
  return Response.json(body, { status, headers: {
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
    "cross-origin-resource-policy": "same-origin",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  } });
}

function safeRequest(request: Request): boolean {
  const url = new URL(request.url);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !local) return false;
  if (request.headers.get("origin") !== url.origin) return false;
  if (request.headers.get("sec-fetch-site") !== "same-origin") return false;
  const mode = request.headers.get("sec-fetch-mode");
  return mode === "cors" || mode === "same-origin";
}

export async function POST(request: Request): Promise<Response> {
  if (!safeRequest(request)) return json({ accepted: false }, 403);
  if ((request.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return json({ accepted: false }, 415);
  }
  const declaredLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(declaredLength) && declaredLength > maximumBodyBytes) return json({ accepted: false }, 413);
  const raw = await request.text();
  if (!raw || new TextEncoder().encode(raw).byteLength > maximumBodyBytes) return json({ accepted: false }, 413);
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return json({ accepted: false }, 400); }
  if (!value || typeof value !== "object" || Array.isArray(value)) return json({ accepted: false }, 400);
  const candidate = value as Record<string, unknown>;
  if (Object.keys(candidate).sort().join(",") !== "questionStableId,selectedOptionIds"
    || typeof candidate.questionStableId !== "string"
    || !Array.isArray(candidate.selectedOptionIds)
    || !candidate.selectedOptionIds.every((item) => typeof item === "string")) {
    return json({ accepted: false }, 400);
  }
  const judgement = judgeImageAnswer(candidate.questionStableId, candidate.selectedOptionIds as string[]);
  return judgement ? json({ accepted: true, ...judgement }, 200) : json({ accepted: false }, 400);
}
