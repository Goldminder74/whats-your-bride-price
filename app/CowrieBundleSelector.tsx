"use client";
import {usePurchaseConfirmation} from './PurchaseConfirmationFields.tsx';
import {COWRIE_PURCHASE_CONSENT} from './purchaseTerms.ts';
import {useEffect,useRef,useState} from "react";
import {cowrieProducts,cowrieProductKeys,type CowrieProductKey} from "../db/cowrieProducts.ts";
import {createCowriePurchase,readCowrieOffer,savePendingCowrieOrder} from "./cowrieCommerceClient.ts";

export default function CowrieBundleSelector({walletReference,ownerCredential}:Readonly<{walletReference:string;ownerCredential:string}>){
 const confirmation=usePurchaseConfirmation();
 const [available,setAvailable]=useState(false);const [selected,setSelected]=useState<CowrieProductKey|null>(null);const [consent,setConsent]=useState(false);const [busy,setBusy]=useState(false);const [notice,setNotice]=useState("");const attempt=useRef<string|null>(null);
 useEffect(()=>{const controller=new AbortController();void readCowrieOffer(walletReference,ownerCredential,controller.signal).then(()=>setAvailable(true)).catch(()=>setAvailable(false));return()=>controller.abort();},[walletReference,ownerCredential]);
 if(!available)return null;
 const buy=async()=>{
   if(!selected||!consent||!confirmation.ready){setNotice("Choose a bundle and confirm immediate digital delivery to continue.");return;}
   setBusy(true);setNotice("Preparing your checkout…");
   try{if(!attempt.current)attempt.current=[...crypto.getRandomValues(new Uint8Array(16))].map(byte=>byte.toString(16).padStart(2,"0")).join("");const order=await createCowriePurchase({productKey:selected,walletReference,anonymousSessionCredential:ownerCredential,consent,idempotencyKey:attempt.current,confirmation:confirmation.details});savePendingCowrieOrder(window.sessionStorage,order.reference);window.location.assign(order.url);}catch{setBusy(false);setNotice("Checkout is unavailable. Your balance is unchanged. Retry or choose a free game.");}
 };
 return <section className="cowrie-bundles" aria-labelledby="cowrie-bundles-title">
  <h3 id="cowrie-bundles-title">One-off Cowrie bundles</h3><p>1 Cowrie unlocks 1 additional random Quick Play. Your first two random Quick Plays are free; Daily Challenges and incoming challenges stay free.</p>
  <fieldset disabled={busy}><legend>Choose a bundle</legend><div className="cowrie-bundle-options">{cowrieProductKeys.map(key=><label key={key} htmlFor={`bundle-${key}`} aria-label={`${cowrieProducts[key].quantity} Cowries, ${cowrieProducts[key].displayPrice}`}><input id={`bundle-${key}`} type="radio" name="cowrie-bundle" checked={selected===key} onChange={()=>{setSelected(key);setConsent(false);attempt.current=null;setNotice("");}}/><span><b>{cowrieProducts[key].quantity} Cowries</b><strong>{cowrieProducts[key].displayPrice}</strong><small>{cowrieProducts[key].approximateUnitPrice}</small></span></label>)}</div></fieldset>
  <p>Purchased Cowries do not expire. Bonus Cowries may expire after 180 days. No cash value; no transfer, resale or withdrawal. One-off payment, no subscription.</p>
  {confirmation.fields}
  <label className="cowrie-delivery-consent"><input type="checkbox" checked={consent} disabled={busy} onChange={event=>setConsent(event.target.checked)}/><span>{COWRIE_PURCHASE_CONSENT}</span></label>
  <p className="cowrie-refund-copy">Contact us within 14 days to cancel your bundle for a full refund, including if you used credits. Remaining credits from that purchase are withdrawn; other purchases and bonus Cowries are preserved. Your statutory rights remain.</p>
  <p><a href="/terms">Terms</a> · <a href="/privacy">Privacy notice</a></p><p>Keep your existing wallet recovery credential safe. Buying does not create a new recovery credential.</p>
  <button type="button" disabled={busy||!confirmation.ready} onClick={()=>void buy()}>{busy?"Preparing checkout…":selected?`Continue to Stripe · ${cowrieProducts[selected].displayPrice}`:"Continue to Stripe"}</button><p role="status" aria-live="polite">{notice}</p>
 </section>;
}
