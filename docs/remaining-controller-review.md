# Only outstanding controller decisions — 23 October 2026

Seller identity, UK-only sales,18+ free/paid audience, support contacts/target,
saveable-plus-email confirmations and the voluntary14-day refund policy are settled.
Do not request those decisions again. A blank Stripe tax-ID field is not a failed
onboarding gate; owner is not VAT registered and has no known UTR. No identifier,
income, identity document, banking detail or address belongs in chat.

## Secure input

Existing Worker `wybp-prod-app-r001` → Settings → Variables and Secrets → add
Secret `WYBP_PUBLIC_SELLER_DETAILS_JSON`. Exact eight-field example is at the top
of owner-purchase-review.md. Replace only the address placeholder in Cloudflare,
including postcode/country, and optionally a public telephone. Complaints address
null means the same address. Save/Deploy without changing flags. Reply only
“seller details installed”. The parser rejects the placeholder; no real address
is assumed installed. Do not put it in ops/test/benchmark/build variables or Git.

## ICO status — only unavoidable private declaration

Please complete the [ICO fee self-assessment](https://ico.org.uk/for-organisations/data-protection-fee/data-protection-fee-self-assessment/)
using the organisation's facts directly there. Report only “exempt”, “registered”
or “fee required”; no turnover, identifiers, address or payment details. No fee
or exemption has been invented. If a fee is required, payment is a separate owner
action/approval: current tier1 fee is52GBP/year,47GBP by direct debit, subject to
the actual assessed tier. No fee payment or new subscription was made.
[Current fees](https://ico.org.uk/for-organisations/data-protection-fee/data-protection-fee/).

## Proposed remaining privacy/legal wording — controller review pending

Recommended wording for the processing-purpose decision:

“Classes for Culture uses the minimum information needed to provide your requested
game, wallet, paid result and purchase confirmation. Necessary paid-service and
pre-contract processing relies on contract; applicable accounting and statutory
records rely on legal obligations. Security, fraud prevention and proportionate
service operation rely on documented legitimate interests. Optional analytics
remains off at launch; activating it later requires its separate opt-in controls.
Photographs stay on your device. We do not sell player data or use it for targeted
advertising. Contact team@classesforculture.com about privacy or complaints.”

This is proposed wording, not owner/professional approval. Free-service processing
still needs its purpose-specific basis and legitimate-interest balancing recorded;
contract is not a catch-all. Technical findings/defaults must support the statement.
[ICO lawful bases](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/a-guide-to-lawful-basis/).

Processor/transfer work remains engineer-owned: verify contracts and actual roles
for Cloudflare, encrypted Google Drive custody, SMTP/Namecheap and Stripe; do not
assume a personal Google account has a Workspace processing agreement. Do not claim
transfer safeguards or UK-only processing from a D1 location hint. Final public
notice now identifies the actual direct-Cloudflare route, Netlify private/information
sites, encrypted Drive custody, Private Email transport and Stripe, replacing
obsolete Sites wording without claiming completed contractual/transfer review.
Any genuinely ambiguous declaration or missing provider agreement must be presented
concretely before approval; no automatic paid-provider migration is authorised.

The18+ decision is retained. It does not establish that children are unlikely to
access the game or that a checkbox verifies age. Recommended direction: retain
data-minimising/high-privacy defaults for everyone and document a proportionate
children-access/age-assurance assessment. No date of birth, identity check service
or additional data collection is authorised by this recommendation. The engineering
assessment is not complete and cannot be replaced by approving this sentence.
[ICO proportionate age assurance](https://ico.org.uk/about-the-ico/what-we-do/information-commissions-opinions/age-assurance-for-the-children-s-code/5-risk-assessment-and-age-assurance/).

Existing approved commercial wording does not need re-approval. Remaining liability,
applicable-law/privacy publication wording and substantiated processing/transfer
facts still require final review; draft pages remain marked unapproved. No invented
company number, VAT number, ICO registration, legal opinion or compliance guarantee.
