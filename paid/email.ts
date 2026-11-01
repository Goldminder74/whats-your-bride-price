import { PaidError } from "./errors.ts";
import { SUPPORT_EMAIL } from "./receipt.ts";

export type ReceiptMessage = Readonly<{
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  idempotencyKey: string;
}>;

export type ReceiptResult = Readonly<{ provider: string; id: string }>;

export interface TransactionalEmail {
  send(message: ReceiptMessage): Promise<ReceiptResult>;
}

const ADDRESS = /^[^@\s<>"]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

export type ParsedReceiptFrom = Readonly<{ name: string | null; address: string; header: string }>;

/** Receipts go out from a subdomain such as mail.classesforculture.com, never the apex. A display name is allowed. */
export function parseReceiptFrom(from: string): ParsedReceiptFrom {
  const trimmed = from.trim();
  const wrapped = /^(.*)<([^<>]+)>$/.exec(trimmed);
  const name = wrapped ? wrapped[1].trim().replace(/^"|"$/g, "") : null;
  const address = (wrapped ? wrapped[2] : trimmed).trim();
  if (!ADDRESS.test(address) || address.length > 200 || (name !== null && (name.length === 0 || name.length > 80 || /[<>"\r\n]/.test(name)))) {
    throw new PaidError("email_from_invalid", 503);
  }
  const host = address.split("@")[1]?.toLowerCase() ?? "";
  if (host.split(".").length < 3) throw new PaidError("email_from_must_be_subdomain", 503);
  const header = name ? `${name} <${address}>` : address;
  return { name, address, header };
}

export function assertReceiptFrom(from: string): void {
  parseReceiptFrom(from);
}

export function assertReplyTo(replyTo: string): string {
  const address = replyTo.trim();
  if (!ADDRESS.test(address) || address.length > 200) throw new PaidError("email_reply_to_invalid", 503);
  return address;
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

export type EmailClientOptions = Readonly<{
  apiKey: string;
  from: string;
  replyTo?: string;
  fetchImpl?: typeof fetch;
}>;

export function createResendEmail(apiKeyOrOptions: string | EmailClientOptions, from?: string, fetchImpl: typeof fetch = fetch): TransactionalEmail {
  const options: EmailClientOptions = typeof apiKeyOrOptions === "string"
    ? { apiKey: apiKeyOrOptions, from: from || "", replyTo: SUPPORT_EMAIL, fetchImpl }
    : apiKeyOrOptions;
  const sender = parseReceiptFrom(options.from);
  const replyTo = assertReplyTo(options.replyTo || SUPPORT_EMAIL);
  const fetchRequest = options.fetchImpl || fetchImpl;
  return {
    async send(message) {
      if (!options.apiKey) throw new PaidError("email_not_configured", 503);
      const result = await postJson("https://api.resend.com/emails", {
        authorization: `Bearer ${options.apiKey}`,
        "idempotency-key": message.idempotencyKey,
      }, {
        from: sender.header,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
        reply_to: message.replyTo || replyTo,
      }, fetchRequest);
      return { provider: "resend", id: result.id };
    },
  };
}

export function createPostmarkEmail(serverTokenOrOptions: string | EmailClientOptions, from?: string, fetchImpl: typeof fetch = fetch): TransactionalEmail {
  const options: EmailClientOptions = typeof serverTokenOrOptions === "string"
    ? { apiKey: serverTokenOrOptions, from: from || "", replyTo: SUPPORT_EMAIL, fetchImpl }
    : serverTokenOrOptions;
  const sender = parseReceiptFrom(options.from);
  const replyTo = assertReplyTo(options.replyTo || SUPPORT_EMAIL);
  const fetchRequest = options.fetchImpl || fetchImpl;
  return {
    async send(message) {
      if (!options.apiKey) throw new PaidError("email_not_configured", 503);
      const result = await postJson("https://api.postmarkapp.com/email", {
        "x-postmark-server-token": options.apiKey,
      }, {
        From: sender.header,
        To: message.to,
        Subject: message.subject,
        TextBody: message.text,
        HtmlBody: message.html,
        ReplyTo: message.replyTo || replyTo,
        MessageStream: "outbound",
      }, fetchRequest);
      return { provider: "postmark", id: result.id };
    },
  };
}

export function createTransactionalEmail(
  provider: string,
  apiKey: string,
  from: string,
  replyTo = SUPPORT_EMAIL,
  fetchImpl: typeof fetch = fetch,
): TransactionalEmail {
  if (provider === "mock") return createMockEmail();
  const options = { apiKey, from, replyTo, fetchImpl };
  if (provider === "resend") return createResendEmail(options);
  if (provider === "postmark") return createPostmarkEmail(options);
  throw new PaidError("email_provider_rejected", 503);
}
