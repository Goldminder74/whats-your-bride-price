import { getOwnerDashboardAccess } from "../../ownerDashboardAuth.ts";
import { loadQuestionBankAfterOwnerAuthorization, QuestionBankOwnerAccessError, safeQuestionBankOwnerRequest } from "../../questionBankOwner.ts";
import { getQuestionBankRuntime } from "../../questionBankRuntime.ts";
import { parseQuestionBankCsv, parseQuestionBankJson, previewQuestionBankImport, questionBankCsv, questionBankJson, QUESTION_BANK_MAX_IMPORT_BYTES, QuestionBankImportError } from "../../../db/questionBankWorkflow.ts";
import { QuestionBankValidationError } from "../../../db/questionBankContracts.ts";

const headers = Object.freeze({
  "cache-control": "private, no-store, max-age=0, must-revalidate",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'; sandbox",
  "cross-origin-resource-policy": "same-origin",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
});

function denied(status = 404): Response { return new Response(null, { status, headers }); }

async function ownerDocument() {
  const access = await getOwnerDashboardAccess();
  return loadQuestionBankAfterOwnerAuthorization(access, async () => {
    const runtime = await getQuestionBankRuntime();
    if (!runtime) throw new Error("question_bank_storage_unavailable");
    return runtime.list();
  });
}

export async function GET(request: Request): Promise<Response> {
  if (!safeQuestionBankOwnerRequest(request)) return denied();
  try {
    const url = new URL(request.url);
    if ([...url.searchParams.keys()].some((key) => key !== "format" || url.searchParams.getAll(key).length !== 1)) return denied(400);
    const format = url.searchParams.get("format") || "json";
    const document = await ownerDocument();
    if (format === "json") return new Response(questionBankJson(document), { status: 200, headers: { ...headers, "content-type": "application/json; charset=utf-8", "content-disposition": "attachment; filename=\"wybp-question-bank.json\"" } });
    if (format === "csv") return new Response(questionBankCsv(document), { status: 200, headers: { ...headers, "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=\"wybp-question-bank.csv\"" } });
    return denied(400);
  } catch (error) {
    return denied(error instanceof QuestionBankOwnerAccessError ? 404 : 503);
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!safeQuestionBankOwnerRequest(request)) return denied();
  const access = await getOwnerDashboardAccess();
  if (!access.authorized || !access.identity) return denied();
  const declaredLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(declaredLength) && declaredLength > QUESTION_BANK_MAX_IMPORT_BYTES) return denied(413);
  try {
    const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
    const body = await request.text();
    const proposed = contentType === "application/json" ? parseQuestionBankJson(body)
      : contentType === "text/csv" ? parseQuestionBankCsv(body) : null;
    if (!proposed) return denied(415);
    const existing = await loadQuestionBankAfterOwnerAuthorization(access, async () => {
      const runtime = await getQuestionBankRuntime();
      if (!runtime) throw new Error("question_bank_storage_unavailable");
      return runtime.list();
    });
    const report = previewQuestionBankImport(proposed, existing);
    return Response.json({ preview: report }, { status: 200, headers });
  } catch (error) {
    if (error instanceof QuestionBankImportError || error instanceof QuestionBankValidationError) return denied(400);
    return denied(503);
  }
}
