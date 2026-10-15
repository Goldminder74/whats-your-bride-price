import Link from "next/link";
import { legalInformation, missingLegalActivationDetails } from "./legalConfig.ts";
import { getPublicSellerDetails } from "./sellerDetails.ts";

export function DraftLegalWarning() {
  if (legalInformation.approvedForProduction) return null;
  return <aside className="legal-draft-warning" role="note"><strong>Draft — not approved for production</strong><p>Production legal review and activation remain incomplete. Configured seller details do not constitute legal approval. This page provides a technical draft.</p><details><summary>Activation review checklist</summary><ul>{missingLegalActivationDetails.map((item)=><li key={item}>{item}</li>)}</ul></details></aside>;
}

export async function LegalPage({kicker,title,children}:Readonly<{kicker:string;title:string;children:React.ReactNode}>) {
  const seller = await getPublicSellerDetails();
  return <main className="legal-shell"><article className="legal-document"><header><p>{kicker}</p><h1>{title}</h1><p>Last technical review: 31 August 2026. Professional and owner approval remains outstanding.</p></header><DraftLegalWarning/>{children}{seller && <section aria-labelledby="seller-contact-heading"><h2 id="seller-contact-heading">Seller and contact details</h2><p>{seller.legalName}, sole trader trading as {seller.tradingName}. Not VAT registered.</p><dl><dt>Geographical address</dt><dd>{seller.geographicalAddress}</dd>{seller.complaintsAddress && <><dt>Complaints address</dt><dd>{seller.complaintsAddress}</dd></>}<dt>Support and complaints</dt><dd><a href={`mailto:${seller.supportEmail}`}>{seller.supportEmail}</a></dd><dt>Privacy requests</dt><dd><a href={`mailto:${seller.privacyEmail}`}>{seller.privacyEmail}</a></dd>{seller.telephone && <><dt>Telephone</dt><dd>{seller.telephone}</dd></>}</dl></section>}<p><Link href="/">Return to the game</Link></p></article></main>;
}

export const draftRobots = Object.freeze({ index:false, follow:false });
