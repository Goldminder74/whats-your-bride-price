import type { OwnerDashboardAccess } from "./ownerDashboardAccess.ts";
import type { QuestionBankDocument } from "../db/questionBankContracts.ts";

export class QuestionBankOwnerAccessError extends Error {}

export function safeQuestionBankOwnerRequest(request: Request): boolean {
  const url = new URL(request.url);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const origin = request.headers.get("origin");
  return (url.protocol === "https:" || local)
    && request.headers.get("sec-fetch-site") === "same-origin"
    && (origin === url.origin || (request.method === "GET" && !origin));
}

export async function loadQuestionBankAfterOwnerAuthorization(
  access: OwnerDashboardAccess,
  loader: () => Promise<QuestionBankDocument>,
): Promise<QuestionBankDocument> {
  if (!access.authorized || !access.identity) throw new QuestionBankOwnerAccessError("owner_access_required");
  return loader();
}
