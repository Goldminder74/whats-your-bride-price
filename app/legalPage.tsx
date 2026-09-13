import Link from "next/link";
import { legalInformation, missingLegalActivationDetails } from "./legalConfig.ts";

export function DraftLegalWarning() {
  if (legalInformation.approvedForProduction) return null;
  return <aside className="legal-draft-warning" role="note"><strong>Draft — not approved for production</strong><p>Required controller, contact and professional-review details are not configured. This page provides a truthful technical draft and must not be represented as legal approval.</p><details><summary>Missing activation details</summary><ul>{missingLegalActivationDetails.map((item)=><li key={item}>{item}</li>)}</ul></details></aside>;
}

export function LegalPage({kicker,title,children}:Readonly<{kicker:string;title:string;children:React.ReactNode}>) {
  return <main className="legal-shell"><article className="legal-document"><header><p>{kicker}</p><h1>{title}</h1><p>Last technical review: 31 August 2026. Professional and owner approval remains outstanding.</p></header><DraftLegalWarning/>{children}<p><Link href="/">Return to the game</Link></p></article></main>;
}

export const draftRobots = Object.freeze({ index:false, follow:false });
