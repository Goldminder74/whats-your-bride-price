/** Public seller information is installed as a runtime Secret to keep the owner’s
 * address out of Git/builds. Its intended legal-page output is public at launch.
 * This configuration does not confer legal sign-off or enable commerce.
 */
export type PublicSellerDetails = Readonly<{
  version: 1;
  legalName: string;
  tradingName: string;
  geographicalAddress: string;
  complaintsAddress: string | null;
  telephone: string | null;
  supportEmail: string;
  privacyEmail: string;
}>;

export function parseSellerDetails(raw: unknown): PublicSellerDetails | null {
  try {
    if (typeof raw !== "string" || raw.length > 4096) return null;
    const value = JSON.parse(raw) as Record<string, unknown>;
    const fields = ["version", "legalName", "tradingName", "geographicalAddress", "complaintsAddress", "telephone", "supportEmail", "privacyEmail"];
    if (!value || Array.isArray(value) || Object.keys(value).sort().join() !== fields.sort().join() || value.version !== 1) return null;
    const text = (entry: unknown, maximum: number): entry is string => typeof entry === "string" && entry.trim() === entry && entry.length > 0 && entry.length <= maximum && !/[<>]/.test(entry) && ![...entry].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
    if (value.legalName !== "Ayodele Ayeni" || value.tradingName !== "Classes for Culture"
      || !text(value.geographicalAddress, 1000)
      || /^REPLACE_WITH_|^YOUR[_ ](?:PUBLIC|BUSINESS)/i.test(value.geographicalAddress)
      || (value.complaintsAddress !== null && !text(value.complaintsAddress, 1000))
      || (value.telephone !== null && (typeof value.telephone !== "string" || !/^\+?[0-9 ()-]{7,30}$/.test(value.telephone)))
      || value.supportEmail !== "team@classesforculture.com"
      || !text(value.privacyEmail, 254) || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@classesforculture\.com$/.test(value.privacyEmail)) return null;
    return Object.freeze(value as unknown as PublicSellerDetails);
  } catch { return null; } // No raw configuration or parser errors in logs.
}

export function sellerDetailsFromRuntime(runtime: Readonly<Record<string, unknown>>): PublicSellerDetails | null {
  // Existing test/rehearsal resources must never receive or expose the real address.
  return runtime.WYBP_AUTHORITY_ROLE === "production-app"
    ? parseSellerDetails(runtime.WYBP_PUBLIC_SELLER_DETAILS_JSON) : null;
}

export async function getPublicSellerDetails(): Promise<PublicSellerDetails | null> {
  try {
    const { env } = await import("cloudflare:workers");
    return sellerDetailsFromRuntime(env as unknown as Record<string, unknown>);
  } catch { return null; } // Local/static builds have no runtime Secret.
}
