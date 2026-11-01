import type { Metadata } from "next";
import { LegalPage, draftRobots } from "../legalPage.tsx";
import { createPublicAppUrl } from "../publicAppOrigin.ts";

export const metadata: Metadata = {
  title: "Draft Refunds | What’s Your Bride Price?",
  description: "Placeholder refund terms for What’s Your Bride Price?. Owner approval is required before publication.",
  alternates: { canonical: createPublicAppUrl("/refunds") },
  robots: draftRobots,
};

export default function RefundsPage() {
  return <LegalPage kicker="Draft refunds" title="Refunds">
    <p><strong>PLACEHOLDER. Owner approval required before this page is published.</strong> This is not a live refund promise and it does not replace statutory rights.</p>
    <h2>Instant digital content</h2>
    <p>UK, EU and EEA buyers are asked, before Stripe Checkout opens, to confirm they are 18 or over and to acknowledge that immediate supply of Cowries or Royal Reveal ends the 14-day right to withdraw. That acknowledgement is placeholder copy. It does not limit rights where the content is faulty or not as described.</p>
    <h2>Voluntary refunds</h2>
    <p>A separate voluntary refund policy is not activated. If it is later approved, a full refund would go back to the original payment method through Stripe and would remove the remaining value of that purchase only. It would not create a debt or remove an unrelated purchase.</p>
    <h2>How to ask</h2>
    <p>Email <a href="mailto:team@classesforculture.com">team@classesforculture.com</a> with the order reference from the receipt. The draft target is an acknowledgement within two working days. Signed Stripe refund and dispute notifications update access when the paid Worker is configured. Read the <a href="/terms">terms</a> and <a href="/privacy">privacy notice</a>, which are also drafts.</p>
  </LegalPage>;
}
