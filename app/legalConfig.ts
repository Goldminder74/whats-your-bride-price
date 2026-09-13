export const legalInformation = Object.freeze({
  approvedForProduction: false,
  controllerLegalName: null as string | null,
  tradingName: null as string | null,
  postalAddress: null as string | null,
  geographicContact: null as string | null,
  privacyContact: null as string | null,
  communityContact: null as string | null,
  icoRegistrationOrFeeDecision: null as string | null,
  lawfulBasisAssessment: null as string | null,
  internationalTransferMechanism: null as string | null,
  reviewedAt: null as string | null,
});

export const missingLegalActivationDetails = Object.freeze([
  "Controller legal identity",
  "Trading name",
  "Required geographic and postal contact details",
  "Privacy and community-reporting contact routes",
  "ICO registration or fee decision",
  "Final lawful-basis assessment",
  "Children’s Code applicability and numeric minimum-audience decisions",
  "Processor and international-transfer review",
  "Terms, consumer-rights and refund review",
  "Final retention, accessibility and professional legal review",
]);
