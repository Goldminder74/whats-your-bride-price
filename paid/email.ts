import { PaidError } from "./errors.ts";

export type ReceiptMessage = Readonly<{
  to: string;
  subject: string;
  text: string;
  idempotencyKey: string;
}>;

export type ReceiptResult = Readonly<{ provider: string; id: string }>;

export interface TransactionalEmail {
  send(message: ReceiptMessage): Promise<ReceiptResult>;
}

/** Receipts go out from a subdomain such as mail.classesforculture.com, never the apex. */
export function assertReceiptFrom(from: string): void {
  if (!/^[^@\s]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(from) || from.length > 200) {
    throw new PaidError("email_from_invalid", 503);
  }
  const host = from.split("@")[1]?.toLowerCase() ?? "";
  if (host.split(".").length < 3) throw new PaidError("email_from_must_be_subdomain", 503);
}

export function createMockEmail(): TransactionalEmail & { sent: ReceiptMessage[] } {
  const sent: ReceiptMessage[] = [];
  return {
    sent,
    async send(message) {
      sent.push(message);
      return { provider: "mock", id: `mock_${message.idempotencyKey}` };
    },
  };
}

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  fetchImpl: typeof fetch,
): Promise<{ id: string }> {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null) as { id?: unknown; MessageID?: unknown } | null;
  const id = payload && (typeof payload.id === "string" ? payload.id : typeof payload.MessageID === "string" ? payload.MessageID : null);
  if (!response.ok || !id) throw new PaidError("email_provider_rejected", 502);
  return { id };
}

export function createResendEmail(apiKey: string, from: string, fetchImpl: typeof fetch = fetch): TransactionalEmail {
  assertReceiptFrom(from);
  return {
    async send(message) {
      if (!apiKey) throw new PaidError("email_not_configured", 503);
      const result = await postJson("https://api.resend.com/emails", {
        authorization: `Bearer ${apiKey}`,
        "idempotency-key": message.idempotencyKey,
      }, { from, to: [message.to], subject: message.subject, text: message.text }, fetchImpl);
      return { provider: "resend", id: result.id };
    },
  };
}

export function createPostmarkEmail(serverToken: string, from: string, fetchImpl: typeof fetch = fetch): TransactionalEmail {
  assertReceiptFrom(from);
  return {
    async send(message) {
      if (!serverToken) throw new PaidError("email_not_configured", 503);
      const result = await postJson("https://api.postmarkapp.com/email", {
        "x-postmark-server-token": serverToken,
      }, {
        From: from,
        To: message.to,
        Subject: message.subject,
        TextBody: message.text,
        MessageStream: "outbound",
      }, fetchImpl);
      return { provider: "postmark", id: result.id };
    },
  };
}

export function createTransactionalEmail(
  provider: string,
  apiKey: string,
  from: string,
  fetchImpl: typeof fetch = fetch,
): TransactionalEmail {
  if (provider === "mock") return createMockEmail();
  if (provider === "resend") return createResendEmail(apiKey, from, fetchImpl);
  if (provider === "postmark") return createPostmarkEmail(apiKey, from, fetchImpl);
  throw new PaidError("email_provider_rejected", 503);
}
