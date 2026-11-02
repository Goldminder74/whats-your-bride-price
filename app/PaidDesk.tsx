"use client";

/* eslint-disable react-hooks/set-state-in-effect -- the desk loads access and a return order once */

import { FormEvent, useEffect, useId, useState } from "react";

type Product = { key: string; name: string; displayPrice: string; kind: string };
type Catalog = {
  products: Product[];
  countries: { code: string; name: string }[];
  blockedCountries: string[];
  purchasesBlocked: boolean;
  purchaseBlockedMessage: string;
  waiverCountries: string[];
  waiverText: string;
};

const PLAYER_KEY = "wybp-player";

function playerId(): string {
  const existing = localStorage.getItem(PLAYER_KEY) || "";
  if (/^[A-Za-z0-9_-]{16,64}$/.test(existing)) return existing;
  const created = crypto.randomUUID().replaceAll("-", "");
  localStorage.setItem(PLAYER_KEY, created);
  return created;
}

export function PaidDesk() {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [cowries, setCowries] = useState<number | null>(null);
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
    const id = playerId();
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get("order");
    if (window.location.pathname === "/checkout/return" && orderId) setOpen(true);
    let cancelled = false;
    (async () => {
      try {
        const [accessResponse, catalogResponse] = await Promise.all([
          fetch(`/api/paid/access?player=${id}`),
          fetch("/api/paid/catalog"),
        ]);
        if (!accessResponse.ok || !catalogResponse.ok) return;
        const access = await accessResponse.json() as { cowries: number; royal: boolean };
        const nextCatalog = await catalogResponse.json() as Catalog;
        if (cancelled) return;
        setCowries(access.cowries);
        setRoyal(access.royal);
        setCatalog(nextCatalog);
        setProductKey(nextCatalog.products[0]?.key || "");
        if (orderId) {
          const orderResponse = await fetch(`/api/paid/orders/${orderId}`);
          const order = await orderResponse.json() as { state?: string; error?: string };
          if (!cancelled) setStatus(order.state ? `Order ${order.state}. Your balance is restored from this browser.` : "That order could not be restored.");
        }
      } catch {
        if (!cancelled) setStatus("Purchases connect when this page is served by the game.");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const blocked = new Set(catalog?.blockedCountries || []);
  const purchasesBlocked = Boolean(catalog?.purchasesBlocked) || blocked.has(country);
  const needsWaiver = (catalog?.waiverCountries || []).includes(country) && !purchasesBlocked;
  const blockedMessage = catalog?.purchaseBlockedMessage || "Purchases aren't available in your country yet. You can still play for free!";

  async function restore() {
    const id = playerId();
    setStatus("Restoring this browser…");
    const response = await fetch(`/api/paid/access?player=${id}`);
    if (!response.ok) { setStatus("Restore is unavailable right now."); return; }
    const access = await response.json() as { cowries: number; royal: boolean };
    setCowries(access.cowries);
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
        body: JSON.stringify({ productKey, email, country, playerId: playerId(), adult, waiver }),
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

  return (
    <>
      <button className="cowrie-chip" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span aria-hidden="true">✦</span>
        <b>{cowries === null ? "Cowries" : `${cowries} cowries`}</b>
        {royal ? <small>Royal</small> : null}
      </button>
      {open && (
        <div className="paid-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
          <div className="paid-card">
            <button className="modal-close" onClick={() => setOpen(false)} aria-label="Close purchases">×</button>
            <p className="eyebrow">Optional extras</p>
            <h2 id={titleId}>COWRIES<br /><i>FOR THE CURIOUS</i></h2>
            <p>The five editions stay free. Cowries and Royal Reveal are one-off extras for this browser. Card details stay with Stripe.</p>
            <p className="paid-balance"><b>{cowries === null ? "—" : cowries}</b> cowries on this browser{royal ? " · Royal Reveal unlocked" : ""}</p>
            <div className="paid-actions">
              <button type="button" className="outline-action" onClick={restore}>Restore this browser</button>
              <a href="/refunds">Refunds</a>
              <a href="/terms">Terms</a>
              <a href="/privacy">Privacy</a>
            </div>
            {!catalog ? <p role="status">{status || "Loading the stall…"}</p> : (
              <form onSubmit={checkout}>
                <label>Extra
                  <select value={productKey} onChange={(event) => setProductKey(event.target.value)}>
                    {catalog.products.map((product) => <option key={product.key} value={product.key}>{product.name} · {product.displayPrice}</option>)}
                  </select>
                </label>
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
