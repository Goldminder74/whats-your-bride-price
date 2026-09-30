"use client";

import { useEffect, useRef, useState } from "react";
import { getOrCreateAnonymousSession } from "./anonymousSession.ts";
import { clearCowrieWallet, openCowrieWallet, readCowrieWallet, recoverCowrieWallet } from "./cowrieClient.ts";
import type { PublicCowrieWallet } from "../db/cowrieWallet.ts";

import CowrieBundleSelector from "./CowrieBundleSelector.tsx";
import {activeFeatureFlags} from "./featureFlags.ts";

export default function CowrieWalletPanel({ refreshKey }: Readonly<{ refreshKey?: string }>) {
  const toggleRef=useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [wallet, setWallet] = useState<PublicCowrieWallet | null>(null);
  const [rawRecovery, setRawRecovery] = useState("");
  const [recoveryReference, setRecoveryReference] = useState("");
  const [recoveryInput, setRecoveryInput] = useState("");
  const [ownerCredential, setOwnerCredential] = useState("");
  const [status, setStatus] = useState("Wallet is ready for this authorised review build.");
  useEffect(() => {
    void Promise.resolve().then(async () => {
      const session = getOrCreateAnonymousSession(window.sessionStorage);
      if (!session.available) throw new Error("unavailable");
      setOwnerCredential(session.sessionId);
      return readCowrieWallet(session.sessionId);
    }).then((value) => {
      setWallet(value); setRecoveryReference(value.walletReference);
      setStatus("Wallet securely restored on this device.");
    }).catch(() => setStatus("Create or recover a wallet before eligible random Quick Play. Secure storage must be available."));
  }, [refreshKey]);
  const create = async () => {
    try {
      const value = await openCowrieWallet(ownerCredential);
      setWallet(value.wallet); setRecoveryReference(value.wallet.walletReference); setRawRecovery(value.recoveryCredential || "");
      setStatus(value.recoveryCredential ? "Wallet created. Save the recovery credential now; it will not be shown again." : "Wallet securely restored on this device.");
    } catch { setStatus("Cowrie Wallet is temporarily unavailable."); }
  };
  const copy = async () => { if (!rawRecovery) return; await navigator.clipboard.writeText(rawRecovery); setStatus("Recovery credential copied."); };
  const download = () => {
    if (!rawRecovery) return;
    const url = URL.createObjectURL(new Blob([`Wallet reference: ${wallet?.walletReference || ""}\nRecovery credential: ${rawRecovery}\n`], { type: "text/plain" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "wallet-recovery.txt"; anchor.click(); URL.revokeObjectURL(url); setStatus("Recovery file downloaded to your device.");
  };
  const recover = async (rotate: boolean) => {
    try {
      const value = await recoverCowrieWallet({ walletReference: recoveryReference, recoveryCredential: recoveryInput, anonymousSessionCredential: ownerCredential }, rotate);
      setWallet(value.wallet); setRawRecovery(value.recoveryCredential || ""); setStatus(rotate ? "Recovery credential rotated. Save the new value now." : "Wallet recovered on this device.");
    } catch { setStatus("Recovery could not be completed. Check both values and try again."); }
  };
  const clear = async () => {
    if (!window.confirm("Freeze wallet access? Your balance and play history will be preserved. Permanent deletion requires the protected support process, which is not active yet.")) return;
    try {
      const state = await clearCowrieWallet(ownerCredential);
      setRawRecovery(""); setRecoveryInput(""); setWallet(null);
      setStatus(state === "frozen" ? "Wallet access is frozen. Your balance has been preserved for protected support handling." : "Wallet is unavailable. Your ownership credentials have been disconnected.");
    } catch { setStatus("Wallet access could not be cleared. Try again later."); }
  };
  return <aside className="cowrie-wallet-control" data-cowrie-wallet>
    <button type="button" ref={toggleRef} className="cowrie-wallet-toggle" aria-expanded={open} onClick={() => setOpen((value) => !value)}><span aria-hidden="true">◉</span> Cowries <b>{wallet?.totalBalance ?? "—"}</b></button>
    {open && <section className="cowrie-wallet-panel" aria-labelledby="cowrie-wallet-title">
      <header><div><p>Closed-loop play access</p><h2 id="cowrie-wallet-title">Cowrie Wallet</h2></div><button type="button" aria-label="Close Cowrie Wallet" onClick={() => {setOpen(false);toggleRef.current?.focus();}}>×</button></header>
      {wallet ? <>
        <div className="cowrie-balance"><span>Total available</span><strong>{wallet.totalBalance}</strong><small>Cowries</small></div>
        <dl><div><dt>Bonus</dt><dd>{wallet.bonusBalance}</dd></div><div><dt>Purchased</dt><dd>{wallet.purchasedBalance}</dd></div><div><dt>Free random plays left</dt><dd>{wallet.freeQuickPlaysRemaining} of 2</dd></div></dl>
        <div className="cowrie-access-copy"><b>Another random Quick Play costs 1 Cowrie after your two free plays.</b><span>Daily Challenges and incoming challenges stay free. The classic fallback stays free where the regional bank is not ready.</span></div>
        <p className="cowrie-expiry"><b>Bonus Cowries expire 180 days after you receive them.</b> Purchased Cowries do not expire.</p>
        {activeFeatureFlags.commerce && activeFeatureFlags.random_quick_play && activeFeatureFlags.cowrie_economy && <CowrieBundleSelector walletReference={wallet.walletReference} ownerCredential={ownerCredential}/>}
        {rawRecovery && <div className="cowrie-recovery-created"><h3>Save your recovery credential</h3><p>Losing both this device credential and your recovery credential may prevent automatic wallet recovery.</p><code aria-label="Recovery credential">{rawRecovery}</code><div><button type="button" onClick={() => void copy()}>Copy credential</button><button type="button" onClick={download}>Download recovery file</button></div></div>}
      </> : <div className="cowrie-unavailable"><p>Create or recover a wallet before eligible random Quick Play. Balances and play access remain unavailable until secure storage is ready.</p><button type="button" disabled={!ownerCredential} onClick={() => void create()}>Create wallet</button></div>}
      <details className="cowrie-recovery"><summary>Recover or rotate a wallet</summary><label>Wallet reference<input value={recoveryReference} onChange={(event) => setRecoveryReference(event.target.value)} autoComplete="off" /></label><label>Recovery credential<input value={recoveryInput} onChange={(event) => setRecoveryInput(event.target.value.trim().toLowerCase())} autoComplete="off" /></label><div><button type="button" disabled={!ownerCredential} onClick={() => void recover(false)}>Recover wallet</button><button type="button" disabled={!ownerCredential} onClick={() => void recover(true)}>Rotate credential</button></div></details>
      <p className="cowrie-no-value">Cowries have no cash value. They cannot be transferred, resold or withdrawn.</p>
      {wallet && <button type="button" className="cowrie-clear" onClick={() => void clear()}>Freeze wallet access</button>}
      <p className="cowrie-worth">A playful culture score, never a measure of human worth.</p>
      <p className="cowrie-status" role="status" aria-live="polite">{status}</p>
    </section>}
  </aside>;
}
