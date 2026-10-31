export function formatPublicExpiry(expiresAt: number | null | undefined): string {
  if (!Number.isSafeInteger(expiresAt) || (expiresAt as number) <= 0) return "90 days after quiz completion";
  const formatted = new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeStyle: "short", timeZone: "UTC" }).format(new Date(expiresAt as number));
  return `${formatted} UTC`;
}
