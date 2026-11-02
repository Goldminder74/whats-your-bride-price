"use client";

import { FormEvent, useEffect, useState } from "react";
import { DEFAULT_PURCHASE_COUNTRY, ROYAL_WAIVER_TEXT } from "../paid/catalog.ts";
import { readPlayerId } from "./paidClient";

type Fact = { id: string; category: string; answer: string; quote: string };
type Downloads = { card: string; story: string; pdf: string; zip: string };
type RevealPack = {
  certificate: string;
  displayName: string;
  tier: string;
  bridePrice: number;
  score: number;
  explanation: string;
  facts: Fact[];
  downloads: Downloads;
};

type Catalog = {
  countries: { code: string; name: string }[];
  blockedCountries: string[];
  purchasesBlocked: boolean;
  purchaseBlockedMessage: string;
  waiverCountries: string[];
  waiverText: string;
  royalWaiverText?: string;
  royalReveal?: boolean;
};

export function RoyalRevealOffer({ resultId, defaultName, edition, score }: { resultId: string; defaultName: string; edition: string; score: number }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState(DEFAULT_PURCHASE_COUNTRY);
  const [adult, setAdult] = useState(false);
  const [waiver, setWaiver] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const response = await fetch("/api/paid/catalog");
      if (!response.ok || cancelled) return;
      const next = await response.json() as Catalog;
      if (!cancelled) setCatalog(next);
    })();
    return () => { cancelled = true; };
  }, []);

  if (!catalog?.royalReveal) return null;
  const blocked = new Set(catalog.blockedCountries || []);
  const purchasesBlocked = Boolean(catalog.purchasesBlocked) || blocked.has(country);
  const needsWaiver = catalog.waiverCountries.includes(country) && !purchasesBlocked;

  async function buy(event: FormEvent) {
    event.preventDefault();
    if (purchasesBlocked) {
      setStatus(catalog?.purchaseBlockedMessage || "Purchases aren't available in your country yet.");
      return;
    }
    setBusy(true);
    setStatus("Opening checkout…");
    try {
      const response = await fetch("/api/paid/checkout", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({
          productKey: "royal_reveal_v1",
          email,
          country,
          playerId: readPlayerId(),
          adult,
          waiver,
          resultId,
          displayName: name,
        }),
      });
      const payload = await response.json() as { url?: string; message?: string; error?: string };
      if (!response.ok || !payload.url) {
        setStatus(payload.message || "Royal Reveal checkout is unavailable.");
        return;
      }
      window.location.href = payload.url;
    } catch {
      setStatus("Royal Reveal checkout is unavailable.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="royal-offer paid-card">
      <p className="eyebrow">One result</p>
      <h2>ROYAL REVEAL<br /><i>£1.99</i></h2>
      <p>A personal Royal Decree for this result: two certificate images, a PDF, and three to five notes quoted from the published question bank. One purchase, this result only.</p>
      {/* eslint-disable-next-line @next/next/no-img-element -- result preview uses the public share-card renderer */}
      <img className="royal-thumb" src={`/api/paid/share-card.png?edition=${edition}&score=${score}`} alt={`Preview of a ${score} of 12 result card`} width="240" height="300" />
      <form onSubmit={buy}>
        <label className="paid-field">Name on the decree
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={32} autoComplete="name" required />
        </label>
        <label className="paid-field">Email address
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required maxLength={200} />
        </label>
        <label className="paid-field">Country
          <select value={country} onChange={(event) => setCountry(event.target.value)}>
            {catalog.countries.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
          </select>
        </label>
        {purchasesBlocked ? <p className="paid-block" role="status">{catalog.purchaseBlockedMessage || "Purchases aren't available in your country yet. You can still play for free!"}</p> : (
          <>
            <label className="paid-check"><input type="checkbox" checked={adult} onChange={(event) => setAdult(event.target.checked)} required /> {"I'm 18 or over."}</label>
            {needsWaiver ? <label className="paid-check"><input type="checkbox" checked={waiver} onChange={(event) => setWaiver(event.target.checked)} required /> {ROYAL_WAIVER_TEXT}</label> : null}
            <button className="big-action" type="submit" disabled={busy}>Get my Royal Decree <span>→</span></button>
          </>
        )}
        <p role="status">{status}</p>
      </form>
    </section>
  );
}

export function RoyalRevealDownloads({ orderId }: { orderId: string }) {
  const [pack, setPack] = useState<RevealPack | null>(null);
  const [status, setStatus] = useState("Opening your decree…");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const response = await fetch("/api/paid/royal-reveal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playerId: readPlayerId(), orderId }),
      });
      if (cancelled) return;
      if (!response.ok) {
        setStatus("This decree is not available on this browser.");
        return;
      }
      setPack(await response.json() as RevealPack);
      setStatus("");
    })();
    return () => { cancelled = true; };
  }, [orderId]);

  if (!pack) return <p role="status">{status}</p>;
  return (
    <section>
      <p><b>{pack.displayName}</b>, {pack.tier}. Bride price {pack.bridePrice} cowries. Score {pack.score}/12. Certificate {pack.certificate}.</p>
      <p>{pack.explanation}</p>
      {/* eslint-disable-next-line @next/next/no-img-element -- generated decree PNG, not a static asset */}
      <img src={pack.downloads.card} alt={`Royal Decree for ${pack.displayName}, ${pack.score} of 12`} width={360} />
      <ul>
        {pack.facts.map((fact) => <li key={fact.id}><b>{fact.answer}</b> ({fact.category}). {fact.quote}</li>)}
      </ul>
      <p>
        <a href={pack.downloads.card}>Decree image</a>{" "}
        <a href={pack.downloads.story}>Story image</a>{" "}
        <a href={pack.downloads.pdf}>PDF</a>{" "}
        <a href={pack.downloads.zip}>Download bundle</a>
      </p>
    </section>
  );
}
