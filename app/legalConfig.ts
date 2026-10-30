import {customerContact} from './customerContact.ts';
export const legalInformation = Object.freeze({
  approvedForProduction: false,
  controllerLegalName: "Ayodele Ayeni",
  tradingName: "Classes for Culture",
  postalAddress: null as string | null,
  geographicContact: null as string | null,
  privacyContact: customerContact.email,
  communityContact: customerContact.email,
  commercialPolicyApprovedAt: "2026-10-23",
  icoRegistrationOrFeeDecision: "Owner-reported exemption following ICO self-assessment, 2026-10-23",
  lawfulBasisAssessment: null as string | null,
  internationalTransferMechanism: null as string | null,
  reviewedAt: "2026-10-23",
});

export const missingLegalActivationDetails = Object.freeze([
  "Required geographical seller address installed securely at runtime",
  "Final lawful-basis assessment",
  "Children’s Code applicability and proportionate age-assurance assessment",
  "Processor and international-transfer review",
  "Remaining privacy and legal publication review beyond the approved commercial policy",
  "Operational retention and rights-request readiness",
]);

/** Seller configuration is validated at request time; never persist its address
 * in source or treat successful installation as approval of the remaining policy. */
export function remainingLegalActivationDetails(sellerConfigured = false) {
  return missingLegalActivationDetails.filter((item) => !sellerConfigured || item !== "Required geographical seller address installed securely at runtime");
}
