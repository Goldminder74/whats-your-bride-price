import Link from "next/link";
import {activeFeatureFlags} from "../../featureFlags.ts";
import CowrieReturnClient from "./CowrieReturnClient.tsx";
export const metadata={title:"Cowrie payment confirmation | What’s Your Bride Price?",robots:{index:false,follow:false}};
export default function CowrieReturnPage(){if(!activeFeatureFlags.commerce||!activeFeatureFlags.cowrie_economy||!activeFeatureFlags.random_quick_play)return <main className="cowrie-return"><h1>Cowrie purchasing is unavailable</h1><p>Your free game options remain available.</p><Link href="/">Return to the game</Link></main>;return <CowrieReturnClient/>;}
