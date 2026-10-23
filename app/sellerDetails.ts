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

/** Private configuration diagnostics: fixed field names/codes only, never values,
 * parser/provider text or unknown input keys. The synthetic record is a validation
 * probe only; it must never be returned as seller information or used as fallback. */
export function sellerConfigurationIssue(raw: unknown): string | null {
  if (parseSellerDetails(raw)) return null;
  if (typeof raw !== "string") return "missing_secret";
  if (raw.length > 4096) return "configuration_too_long";
  let value: Record<string, unknown>;
  try { value = JSON.parse(raw) as Record<string, unknown>; } catch { return "invalid_json"; }
  if (!value || Array.isArray(value) || typeof value !== "object") return "json_object_required";
  const probe: PublicSellerDetails = {version: 1, legalName: "Ayodele Ayeni", tradingName: "Classes for Culture", geographicalAddress: "Synthetic validation probe", complaintsAddress: null, telephone: null, supportEmail: "team@classesforculture.com", privacyEmail: "team@classesforculture.com"};
  const fields = Object.keys(probe);
  const missing = fields.filter(field => !Object.hasOwn(value, field));
  if (missing.length) return "missing_fields:" + missing.join(",");
  if (Object.keys(value).some(field => !fields.includes(field))) return "unexpected_fields";
  for (const field of fields) if (!parseSellerDetails(JSON.stringify({...probe, [field]: value[field]}))) {
    if (field === "geographicalAddress") {
      const address = value[field];
      const reason = typeof address !== "string" ? "not_text" : !address.length ? "empty"
        : /^REPLACE_WITH_|^YOUR[_ ](?:PUBLIC|BUSINESS)/i.test(address) ? "placeholder"
        : address.trim() !== address ? "surrounding_whitespace"
        : /[<>]/.test(address) ? "angle_brackets"
        : [...address].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) ? "control_characters"
        : "too_long";
      return "invalid_field:geographicalAddress:" + reason;
    }
    return "invalid_field:" + field;
  }
  return "configuration_rejected";
}

/** Private operator preparation only. Replace the confirmed missing/placeholder
 * address while preserving every other installed field, then run the SAME strict
 * parser. A different already-valid address is not silently overwritten. No write. */
export function prepareSellerAddressUpdate(raw: unknown, address: unknown): PublicSellerDetails | null {
  const prior = parseSellerDetails(raw);
  if (prior) return address === prior.geographicalAddress ? prior : null;
  if (typeof raw !== "string" || raw.length > 4096 || typeof address !== "string") return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!value || Array.isArray(value) || typeof value !== "object"
      || (value.geographicalAddress !== "" && !(typeof value.geographicalAddress === "string" && /^REPLACE_WITH_|^YOUR[_ ](?:PUBLIC|BUSINESS)/i.test(value.geographicalAddress)))) return null;
    return parseSellerDetails(JSON.stringify({...value, geographicalAddress: address}));
  } catch { return null; }
}

export function sellerDetailsFromRuntime(runtime: Readonly<Record<string, unknown>>): PublicSellerDetails | null {
  // Existing test/rehearsal resources must never receive or expose the real address.
  return runtime.WYBP_AUTHORITY_ROLE === "production-app"
    ? parseSellerDetails(runtime.WYBP_PUBLIC_SELLER_DETAILS_JSON) : null;
}

/** Reuse the already-installed operations Secret through the existing private
 * application binding. No environment dump, test-role fallback or HTTP endpoint.
 * An explicitly configured but invalid app value must not be silently masked. */
export async function resolvePublicSellerDetails(runtime: Readonly<Record<string, unknown>>): Promise<PublicSellerDetails | null> {
  if (runtime.WYBP_AUTHORITY_ROLE !== "production-app") return null;
  if (runtime.WYBP_PUBLIC_SELLER_DETAILS_JSON !== undefined) return sellerDetailsFromRuntime(runtime);
  try {
    const authority = runtime.AUTHORITY as { publicSellerDetails?: () => Promise<unknown> } | undefined;
    if (typeof authority?.publicSellerDetails !== "function") return null;
    return parseSellerDetails(JSON.stringify(await authority.publicSellerDetails()));
  } catch { return null; } // Never log configuration, RPC payloads or parser errors.
}

export async function getPublicSellerDetails(): Promise<PublicSellerDetails | null> {
  try {
    const { env } = await import("cloudflare:workers");
    return resolvePublicSellerDetails(env as unknown as Record<string, unknown>);
  } catch { return null; } // Local/static builds have no runtime Secret.
}
