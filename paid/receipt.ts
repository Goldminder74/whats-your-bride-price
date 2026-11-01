import { CANONICAL_ORIGIN, WAIVER_TEXT, products } from "./catalog.ts";
import type { PaidOrder } from "./repository.ts";

export const RECEIPT_FROM_NAME = "What's Your Bride Price?";
export const SUPPORT_EMAIL = "team@classesforculture.com";
const GAME_URL = `${CANONICAL_ORIGIN}/`;
const REFUND_URL = `${CANONICAL_ORIGIN}/refunds`;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function plain(value: string): string {
  let out = "";
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    out += code < 32 || code === 127 ? " " : char;
  }
  return out.replace(/ +/g, " ").trim();
}

export function shortOrderReference(orderId: string): string {
  const hex = orderId.replace(/^ord_/, "");
  return hex.slice(-8).toUpperCase();
}

export function formatReceiptDate(at: number): string {
  const date = new Date(at);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** Stripe minor units, including two-decimal NGN, KES, GHS, EUR, USD, GBP and CAD. */
export function formatMoney(amountMinor: number, currency: string): string {
  const code = currency.trim().toLowerCase();
  if (!/^[a-z]{3}$/.test(code) || !Number.isSafeInteger(amountMinor)) return "Unavailable";
  try {
    const digits = new Intl.NumberFormat("en", { style: "currency", currency: code }).resolvedOptions().maximumFractionDigits ?? 2;
    const major = amountMinor / 10 ** digits;
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: code, currencyDisplay: "symbol" }).format(major);
  } catch {
    return `${code.toUpperCase()} ${(amountMinor / 100).toFixed(2)}`;
  }
}

export type BrandedMail = Readonly<{
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo: string;
  idempotencyKey: string;
}>;

type ReceiptFacts = Readonly<{
  kind: "purchase" | "refund";
  order: PaidOrder;
  amountMinor: number;
  currency: string;
  taxMinor: number | null;
  at: number;
  replyTo: string;
}>;

function view(facts: ReceiptFacts) {
  const product = products[facts.order.productKey];
  const shortRef = shortOrderReference(facts.order.id);
  const amount = formatMoney(facts.amountMinor, facts.currency);
  const tax = facts.taxMinor !== null && facts.taxMinor > 0 ? formatMoney(facts.taxMinor, facts.currency) : null;
  const waiver = facts.kind === "purchase" && facts.order.waiverVersion
    ? `You asked for immediate supply and acknowledged: ${WAIVER_TEXT}`
    : null;
  return {
    productName: product.name,
    shortRef,
    amount,
    tax,
    date: formatReceiptDate(facts.at),
    waiver,
    headline: facts.kind === "purchase" ? "Your receipt" : "Your refund",
    intro: facts.kind === "purchase"
      ? "Thank you for your purchase. This confirms the digital pack Stripe charged."
      : "This confirms the refund Stripe sent back to the original payment method. The pack from this order is no longer available on the game.",
  };
}

export function purchaseReceipt(input: Omit<ReceiptFacts, "kind">): BrandedMail {
  return render({ ...input, kind: "purchase" }, input.order.id);
}

export function refundReceipt(input: Omit<ReceiptFacts, "kind" | "taxMinor"> & { taxMinor?: number | null }): BrandedMail {
  return render({ ...input, kind: "refund", taxMinor: input.taxMinor ?? null }, `refund_${input.order.id}`);
}

function render(facts: ReceiptFacts, idempotencyKey: string): BrandedMail {
  const details = view(facts);
  const subject = `Your What's Your Bride Price? ${facts.kind === "purchase" ? "receipt" : "refund"} – ${details.productName} (${details.shortRef})`;
  return {
    to: facts.order.email,
    subject,
    text: plainText(facts, details),
    html: htmlReceipt(facts, details),
    replyTo: facts.replyTo,
    idempotencyKey,
  };
}

function plainText(facts: ReceiptFacts, details: ReturnType<typeof view>): string {
  const lines = [
    "What's Your Bride Price?",
    details.headline,
    "",
    plain(details.intro),
    "",
    `Pack: ${plain(details.productName)}`,
    `Amount paid: ${plain(details.amount)}`,
  ];
  if (details.tax) lines.push(`Tax: ${plain(details.tax)}`);
  lines.push(
    `Date: ${details.date}`,
    `Order reference: ${details.shortRef}`,
    `Order id: ${plain(facts.order.id)}`,
    "",
    facts.kind === "purchase"
      ? "Open the game in the browser profile you used to buy. Your Cowries or Royal Reveal are on that profile."
      : "Any remaining value from this purchase has been removed.",
    `Play: ${GAME_URL}`,
    `Refunds: ${REFUND_URL}`,
    `Support: ${SUPPORT_EMAIL}`,
  );
  if (details.waiver) lines.push("", plain(details.waiver));
  lines.push("", "Card details stay with Stripe. This mailbox sends receipts only.");
  return lines.join("\n");
}

function htmlReceipt(facts: ReceiptFacts, details: ReturnType<typeof view>): string {
  const taxRow = details.tax
    ? `<tr><td style="padding:8px 0;color:#d9c7b2;">Tax</td><td style="padding:8px 0;text-align:right;">${escapeHtml(details.tax)}</td></tr>`
    : "";
  const waiver = details.waiver
    ? `<p style="margin:16px 0 0;font-size:14px;line-height:1.5;color:#d9c7b2;">${escapeHtml(details.waiver)}</p>`
    : "";
  const access = facts.kind === "purchase"
    ? "Open the game in the browser profile you used to buy. Your Cowries or Royal Reveal are on that profile."
    : "Any remaining value from this purchase has been removed.";
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(details.headline)}</title></head>
<body style="margin:0;padding:0;background:#1d120b;color:#f6efe4;font-family:Georgia,serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#1d120b;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#2a1b12;border:1px solid #6b4a32;border-radius:16px;">
<tr><td style="padding:28px 24px;">
<p style="margin:0;letter-spacing:.08em;text-transform:uppercase;color:#f0a11a;font-size:13px;">What's Your Bride Price?</p>
<h1 style="margin:8px 0 0;font-size:28px;line-height:1.2;">${escapeHtml(details.headline)}</h1>
<p style="margin:12px 0 0;font-size:16px;line-height:1.5;">${escapeHtml(details.intro)}</p>
<table role="presentation" width="100%" style="margin-top:20px;border-top:1px solid #6b4a32;font-size:16px;">
<tr><td style="padding:8px 0;color:#d9c7b2;">Pack</td><td style="padding:8px 0;text-align:right;">${escapeHtml(details.productName)}</td></tr>
<tr><td style="padding:8px 0;color:#d9c7b2;">Amount paid</td><td style="padding:8px 0;text-align:right;">${escapeHtml(details.amount)}</td></tr>
${taxRow}
<tr><td style="padding:8px 0;color:#d9c7b2;">Date</td><td style="padding:8px 0;text-align:right;">${escapeHtml(details.date)}</td></tr>
<tr><td style="padding:8px 0;color:#d9c7b2;">Order reference</td><td style="padding:8px 0;text-align:right;">${escapeHtml(details.shortRef)}</td></tr>
</table>
<p style="margin:20px 0 0;font-size:16px;line-height:1.5;">${escapeHtml(access)}</p>
<p style="margin:16px 0 0;"><a href="${GAME_URL}" style="display:inline-block;background:#f0a11a;color:#1d120b;text-decoration:none;border-radius:999px;padding:12px 18px;font-weight:bold;">Back to the game</a></p>
${waiver}
<p style="margin:20px 0 0;font-size:14px;line-height:1.5;color:#d9c7b2;">Support: <a href="mailto:${SUPPORT_EMAIL}" style="color:#f0a11a;">${escapeHtml(SUPPORT_EMAIL)}</a><br>Refunds: <a href="${REFUND_URL}" style="color:#f0a11a;">${escapeHtml(REFUND_URL)}</a><br>Sent to ${escapeHtml(facts.order.email)}</p>
<p style="margin:12px 0 0;font-size:12px;line-height:1.4;color:#b5a18e;">Card details stay with Stripe. This mailbox sends receipts only. Full order id: ${escapeHtml(facts.order.id)}</p>
</td></tr></table></td></tr></table></body></html>`;
}
