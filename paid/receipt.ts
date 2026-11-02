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
  const waiver = facts.kind === "purchase" && facts.order.waiverVersion ? WAIVER_TEXT : null;
  return {
    productName: product.name,
    shortRef,
    amount,
    tax,
    date: formatReceiptDate(facts.at),
    waiver,
    headline: facts.kind === "purchase" ? "Your receipt" : "Your refund",
    intro: facts.kind === "purchase"
      ? "Thanks for your purchase! Here's your receipt."
      : "Here's your refund.",
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
      ? (products[facts.order.productKey].kind === "royal_reveal"
        ? "Open the game in the browser profile you used to buy. Your Royal Decree for this result is ready to download there."
        : "Open the game in the browser profile you used to buy. Your Cowries or Royal Reveal are on that profile.")
      : (products[facts.order.productKey].kind === "royal_reveal"
        ? "The amount goes back to the original payment method. This Royal Decree can no longer be downloaded."
        : "The amount goes back to the original payment method. Any remaining value from this purchase has been removed."),
    `Play: ${GAME_URL}`,
    `Refunds: ${REFUND_URL}`,
    `Support: ${SUPPORT_EMAIL}`,
  );
  if (details.waiver) lines.push("", plain(details.waiver));
  lines.push("", "Card details stay with Stripe. This mailbox sends receipts only.");
  return lines.join("\n");
}

function htmlReceipt(facts: ReceiptFacts, details: ReturnType<typeof view>): string {
  const label = "padding:10px 0;color:#5c534c;font-size:16px;line-height:1.4;border-bottom:1px solid #e6e6e6;";
  const value = "padding:10px 0;color:#1a1a1a;font-size:16px;line-height:1.4;text-align:right;border-bottom:1px solid #e6e6e6;";
  const taxRow = details.tax
    ? `<tr><td style="${label}">Tax</td><td style="${value}">${escapeHtml(details.tax)}</td></tr>`
    : "";
  const waiver = details.waiver
    ? `<p style="margin:16px 0 0;font-size:14px;line-height:1.5;color:#1a1a1a;">${escapeHtml(details.waiver)}</p>`
    : "";
  const access = facts.kind === "purchase"
    ? (products[facts.order.productKey].kind === "royal_reveal"
      ? "Open the game in the browser profile you used to buy. Your Royal Decree for this result is ready to download there."
      : "Open the game in the browser profile you used to buy. Your Cowries or Royal Reveal are on that profile.")
    : (products[facts.order.productKey].kind === "royal_reveal"
      ? "The amount goes back to the original payment method. This Royal Decree can no longer be downloaded."
      : "The amount goes back to the original payment method. Any remaining value from this purchase has been removed.");
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${escapeHtml(details.headline)}</title></head>
<body bgcolor="#f7f4ef" style="margin:0;padding:0;background-color:#f7f4ef;color:#1a1a1a;font-family:Georgia,serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f7f4ef" style="background-color:#f7f4ef;"><tr><td align="center" bgcolor="#f7f4ef" style="padding:24px 12px;background-color:#f7f4ef;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="max-width:560px;background-color:#ffffff;border:1px solid #e6e6e6;border-radius:16px;">
<tr><td bgcolor="#ffffff" style="padding:28px 24px;background-color:#ffffff;color:#1a1a1a;">
<p style="margin:0;letter-spacing:.08em;text-transform:uppercase;color:#8a5a12;font-size:13px;font-weight:bold;">What's Your Bride Price?</p>
<h1 style="margin:8px 0 0;font-size:28px;line-height:1.2;color:#1a1a1a;">${escapeHtml(details.headline)}</h1>
<p style="margin:12px 0 0;font-size:16px;line-height:1.5;color:#1a1a1a;">${escapeHtml(details.intro)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;border-top:1px solid #e6e6e6;">
<tr><td style="${label}">Pack</td><td style="${value}">${escapeHtml(details.productName)}</td></tr>
<tr><td style="${label}">Amount paid</td><td style="${value}">${escapeHtml(details.amount)}</td></tr>
${taxRow}
<tr><td style="${label}">Date</td><td style="${value}">${escapeHtml(details.date)}</td></tr>
<tr><td style="${label}">Order reference</td><td style="${value}">${escapeHtml(details.shortRef)}</td></tr>
</table>
<p style="margin:20px 0 0;font-size:16px;line-height:1.5;color:#1a1a1a;">${escapeHtml(access)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;"><tr>
<td bgcolor="#f0a11a" style="background-color:#f0a11a;border-radius:999px;">
<a href="${GAME_URL}" style="display:inline-block;padding:12px 18px;background-color:#f0a11a;color:#1a1a1a;text-decoration:none;border-radius:999px;font-weight:bold;">Back to the game</a>
</td></tr></table>
${waiver}
<p style="margin:20px 0 0;font-size:14px;line-height:1.5;color:#1a1a1a;">Support: <a href="mailto:${SUPPORT_EMAIL}" style="color:#8a5a12;text-decoration:underline;">${escapeHtml(SUPPORT_EMAIL)}</a><br>Refunds: <a href="${REFUND_URL}" style="color:#8a5a12;text-decoration:underline;">${escapeHtml(REFUND_URL)}</a><br>Sent to ${escapeHtml(facts.order.email)}</p>
<p style="margin:12px 0 0;font-size:12px;line-height:1.4;color:#5c534c;">Card details stay with Stripe. This mailbox sends receipts only. Full order id: ${escapeHtml(facts.order.id)}</p>
</td></tr></table></td></tr></table></body></html>`;
}
