/** Public, fixed launch profiles only. A build selects one; no runtime request,
 * arbitrary email address or credential can override the contact destination. */
declare const __WYBP_CUSTOMER_CONTACT_PROFILE__: string | undefined;
export function resolveCustomerContact(profile: unknown = "legacy") {
  if (profile === "legacy") return Object.freeze({profile:"legacy" as const,email:"team@classesforculture.com",termsVersion:"classes-for-culture-purchases-2026-10-23"});
  if (profile === "google-workspace") return Object.freeze({profile:"google-workspace" as const,email:"support@mail.classesforculture.com",termsVersion:"classes-for-culture-purchases-2026-10-28-google-mail"});
  throw Error("customer_contact_profile_unavailable");
}
export const customerContact = resolveCustomerContact(typeof __WYBP_CUSTOMER_CONTACT_PROFILE__ === "undefined" ? "legacy" : __WYBP_CUSTOMER_CONTACT_PROFILE__);
export const customerEmailProviderDescription = customerContact.profile === "google-workspace"
  ? "Google Workspace provides the prepared purchase-confirmation and support email route. Existing Namecheap mailboxes continue separately, including operator-only status alerts without player or order data."
  : "Namecheap Private Email provides operational and purchase-confirmation email transport.";
