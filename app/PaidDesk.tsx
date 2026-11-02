"use client";

/* eslint-disable react-hooks/set-state-in-effect -- the desk loads access and a return order once */

import { FormEvent, useEffect, useId, useState } from "react";
import { fetchWallet, readPlayerId } from "./paidClient";

type Product = { key: string; name: string; displayPrice: string; kind: string; games: number };
type Catalog = {
  products: Product[];
  countries: { code: string; name: string }[];
  blockedCountries: string[];
  purchasesBlocked: boolean;
  purchaseBlockedMessage: string;
  waiverCountries: string[];
  waiverText: string;
};

export function PaidDesk({ forceOpen = false, onClose }: { forceOpen?: boolean; onClose?: () => void }) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [cowries, setCowries] = useState<number | null>(null);
  const [freeGamesLeft, setFreeGamesLeft] = useState<number | null>(null);
  const [royal, setRoyal] = useState(false);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [productKey, setProductKey] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("GB");
  const [adult, setAdult] = useState(false);
  const [waiver, setWaiver] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get("order");
    if (window.location.pathname === "/checkout/return" && orderId) setOpen(true);
    let cancelled = false;
    const load = async () => {
      try {
        const [wallet, catalogResponse] = await Promise.all([
          fetchWallet(),
          fetch("/api/paid/catalog"),
        ]);
        if (cancelled) return;
        if (wallet) {
          setCowries(wallet.cowries);
          setFreeGamesLeft(wallet.freeGamesLeft);
          setRoyal(wallet.royal);
        }
        if (!catalogResponse.ok) return;
        const nextCatalog = await catalogResponse.json() as Catalog;
        if (cancelled) return;
        setCatalog(nextCatalog);
        setProductKey((current) => current || nextCatalog.products[0]?.key || "");
        if (orderId) {
          const orderResponse = await fetch(`/api/paid/orders/${orderId}`);
          const order = await orderResponse.json() as { state?: string };
          if (!cancelled) setStatus(order.state ? `Order ${order.state}. Your balance is restored from this browser.` : "That order could not be restored.");
        }
      } catch {
        if (!cancelled) setStatus("Purchases connect when this page is served by the game.");
      }
    };
    void load();
    const refresh = () => { void load(); };
    window.addEventListener("wybp-wallet", refresh);
    return () => { cancelled = true; window.removeEventListener("wybp-wallet", refresh); };
  }, []);

  const blocked = new Set(catalog?.blockedCountries || []);
  const purchasesBlocked = Boolean(catalog?.purchasesBlocked) || blocked.has(country);
  const needsWaiver = (catalog?.waiverCountries || []).includes(country) && !purchasesBlocked;
  const blockedMessage = catalog?.purchaseBlockedMessage || "Purchases aren't available in your country yet. You can still play for free!";

  async function restore() {
    setStatus("Restoring this browser…");
    const response = await fetch(`/api/paid/access?player=${readPlayerId()}`);
    if (!response.ok) { setStatus("Restore is unavailable right now."); return; }
    const access = await response.json() as { cowries: number; royal: boolean; freeGamesLeft: number };
    setCowries(access.cowries);
    setFreeGamesLeft(access.freeGamesLeft);
    setRoyal(access.royal);
    setStatus(access.royal ? "Restored. Royal Reveal is unlocked on this browser." : `Restored. ${access.cowries} cowries on this browser.`);
  }

  async function checkout(event: FormEvent) {
    event.preventDefault();
    if (purchasesBlocked) { setStatus(blockedMessage); return; }
    setBusy(true);
    setStatus("Opening checkout…");
    try {
      const response = await fetch("/api/paid/checkout", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ productKey, email, country, playerId: readPlayerId(), adult, waiver }),
      });
      const payload = await response.json() as { url?: string; message?: string; error?: string };
      if (!response.ok || !payload.url) {
        setStatus(payload.message || "Checkout is unavailable.");
        return;
      }
      window.location.href = payload.url;
    } catch {
      setStatus("Checkout is unavailable.");
    } finally {
      setBusy(false);
    }
  }

  const shown = open || forceOpen;
  const freeLabel = freeGamesLeft === null ? "free games" : `${freeGamesLeft} free ${freeGamesLeft === 1 ? "game" : "games"} left`;

  return (
    <>
      <button className="cowrie-chip" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span aria-hidden="true">✦</span>
        <span className="cowrie-chip-copy"><b>{cowries === null ? "Cowries" : `${cowries} cowries`}</b><small>{freeLabel}</small></span>
        {royal ? <small>Royal</small> : null}
      </button>
      {shown && (
        <div className={`paid-sheet${forceOpen ? " forced" : ""}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
          <div className="paid-card">
            <button className="modal-close" onClick={() => { setOpen(false); onClose?.(); }} aria-label="Close purchases">×</button>
            <p className="eyebrow">Optional extras</p>
            <h2 id={titleId}>COWRIES<br /><i>FOR THE CURIOUS</i></h2>
            <p>Your first two completed games are free. After that, starting a game costs 5 Cowries. Card details stay with Stripe.</p>
            <p className="paid-balance"><b>{cowries === null ? "—" : cowries}</b> cowries on this browser. {freeLabel}.{royal ? " Royal Reveal from an earlier purchase is still unlocked." : ""}</p>
            <p className="paid-bonus">Welcome bonus: +5 Cowries on your first purchase. Bonus Cowries are used first and expire 14 days after that purchase.</p>
            <div className="paid-actions">
              <button type="button" className="outline-action" onClick={restore}>Restore this browser</button>
              <a href="/refunds">Refunds</a>
              <a href="/terms">Terms</a>
              <a href="/privacy">Privacy</a>
            </div>
            {!catalog ? <p role="status">{status || "Loading the stall…"}</p> : (
              <form onSubmit={checkout}>
                <div className="paid-bundles" role="radiogroup" aria-label="Cowrie bundles">
                  {catalog.products.filter((product) => product.kind !== "royal_reveal").map((product) => (
                    <label key={product.key} className={`paid-bundle${productKey === product.key ? " selected" : ""}`}>
                      <input type="radio" name="bundle" value={product.key} checked={productKey === product.key} onChange={() => setProductKey(product.key)} />
                      <span>{product.name} · {product.games} {product.games === 1 ? "game" : "games"} · {product.displayPrice}</span>
                    </label>
                  ))}
                </div>
                <label className="paid-field">Email address
                  <input type="email" required autoComplete="email" maxLength={200} value={email} onChange={(event) => setEmail(event.target.value)} />
                </label>
                <label>Country
                  <select value={country} onChange={(event) => setCountry(event.target.value)}>
                    {catalog.countries.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
                  </select>
                </label>
                {purchasesBlocked ? <p className="paid-block" role="status">{blockedMessage}</p> : (
                  <>
                    <label className="paid-check"><input type="checkbox" checked={adult} onChange={(event) => setAdult(event.target.checked)} required /> {"I'm 18 or over."}</label>
                    {needsWaiver && <label className="paid-check"><input type="checkbox" checked={waiver} onChange={(event) => setWaiver(event.target.checked)} required /> {catalog.waiverText}</label>}
                    <button className="big-action" type="submit" disabled={busy}>Continue to Stripe <span>→</span></button>
                  </>
                )}
                <p role="status">{status}</p>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
