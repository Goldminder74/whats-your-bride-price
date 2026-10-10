import { activeFeatureFlags } from "../../featureFlags.ts";
import Link from "next/link";
import RoyalRevealReturnClient from "./RoyalRevealReturnClient.tsx";
export const metadata={title:"Royal Reveal payment confirmation | What’s Your Bride Price?",robots:{index:false,follow:false}};
export default function RoyalRevealReturnPage(){if(!activeFeatureFlags.commerce)return <main className="royal-return"><h1>Royal Reveal is not available</h1><p>Your free result remains available.</p><Link href="/">Return to the game</Link></main>;return <main><RoyalRevealReturnClient/></main>;}
