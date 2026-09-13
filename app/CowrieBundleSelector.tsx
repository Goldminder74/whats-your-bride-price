"use client";
import {useEffect,useRef,useState} from "react";
import {cowrieProducts,cowrieProductKeys,type CowrieProductKey} from "../db/cowrieProducts.ts";
import {createCowriePurchase,readCowrieOffer,savePendingCowrieOrder} from "./cowrieCommerceClient.ts";

export default function CowrieBundleSelector({walletReference,ownerCredential}:Readonly<{walletReference:string;ownerCredential:string}>){
 const [available,setAvailable]=useState(false);const [selected,setSelected]=useState<CowrieProductKey|null>(null);const [consent,setConsent]=useState(false);const [busy,setBusy]=useState(false);const [notice,setNotice]=useState("");const attempt=useRef<string|null>(null);
 useEffect(()=>{const controller=new AbortController();void readCowrieOffer(walletReference,ownerCredential,controller.signal).then(()=>setAvailable(true)).catch(()=>setAvailable(false));return()=>controller.abort();},[walletReference,ownerCredential]);
 if(!available)return null;
 const buy=async()=>{
   if(!selected||!consent){setNotice("Choose a bundle and confirm the draft immediate-delivery notice before checkout.");return;}
   setBusy(true);setNotice("Creating your protected order…");
   try{if(!attempt.current)attempt.current=[...crypto.getRandomValues(new Uint8Array(16))].map(byte=>byte.toString(16).padStart(2,"0")).join("");const order=await createCowriePurchase({productKey:selected,walletReference,anonymousSessionCredential:ownerCredential,consent,idempotencyKey:attempt.current});savePendingCowrieOrder(window.sessionStorage,order.reference);window.location.assign(order.url);}catch{setBusy(false);setNotice("Checkout is unavailable. Your balance has not changed. Try again or continue with free game options.");}
 };
 return <section className="cowrie-bundles" aria-labelledby="cowrie-bundles-title">
  <h3 id="cowrie-bundles-title">One-off Cowrie bundles</h3><p>1 Cowrie unlocks 1 additional random Quick Play. Your first two random Quick Plays are free; Daily Challenges and incoming challenges stay free.</p>
  <fieldset disabled={busy}><legend>Choose a bundle</legend><div className="cowrie-bundle-options">{cowrieProductKeys.map(key=><label key={key} htmlFor={`bundle-${key}`} aria-label={`${cowrieProducts[key].quantity} Cowries, ${cowrieProducts[key].displayPrice}`}><input id={`bundle-${key}`} type="radio" name="cowrie-bundle" checked={selected===key} onChange={()=>{setSelected(key);setConsent(false);attempt.current=null;setNotice("");}}/><span><b>{cowrieProducts[key].quantity} Cowries</b><strong>{cowrieProducts[key].displayPrice}</strong><small>{cowrieProducts[key].approximateUnitPrice}</small></span></label>)}</div></fieldset>
  <p>Purchased Cowries do not expire. Bonus Cowries may expire after 180 days. No cash value; no transfer, resale or withdrawal. One-off payment, no subscription.</p>
  <label className="cowrie-delivery-consent"><input type="checkbox" checked={consent} disabled={busy} onChange={event=>setConsent(event.target.checked)}/><span><b>Draft immediate digital-delivery notice</b> — I request immediate access to the digital Cowrie balance after verified payment. I understand that once digital delivery begins, statutory cancellation rights may be affected.</span></label>
  <p className="cowrie-refund-copy">Draft refund policy: verified full refunds remove unused Cowries from that purchase only. Used Cowries and partial refunds require protected owner review; other purchases and bonus Cowries are preserved.</p>
  <p><a href="/terms">Draft terms</a> · <a href="/privacy">Draft privacy notice</a></p><p>Keep your existing wallet recovery credential safe. Buying does not create a new recovery credential.</p>
  <button type="button" disabled={busy} onClick={()=>void buy()}>{busy?"Preparing checkout…":selected?`Continue to Stripe · ${cowrieProducts[selected].displayPrice}`:"Continue to Stripe"}</button><p role="status" aria-live="polite">{notice}</p>
 </section>;
}
