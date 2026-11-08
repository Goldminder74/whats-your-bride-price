"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { CHOOSE_COUNTRY_LABEL, initialPurchaseCountry, ROYAL_WAIVER_TEXT } from "../paid/catalog.ts";
import { DECREE_PREVIEW_NAME, decreeNamePrefill, decreePreviewUrl, previewDisplayName } from "../paid/decreePreviewName.ts";
import { clipFact, displayFact, gemSubject, type CultureFact } from "./cultureGem";
import { readPlayerId } from "./paidClient";

type Fact = CultureFact;
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
  visitorCountry?: string | null;
};

export function RoyalRevealOffer({ resultId, edition, score }: { resultId: string; edition: string; score: number }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [name, setName] = useState("");
  const nameTouched = useRef(false);
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("");
  const countryTouched = useRef(false);
  const [adult, setAdult] = useState(false);
  const [waiver, setWaiver] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [previewName, setPreviewName] = useState(DECREE_PREVIEW_NAME);

  useEffect(() => {
    const handle = window.setTimeout(() => setPreviewName(previewDisplayName(name)), 180);
    return () => window.clearTimeout(handle);
  }, [name]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const response = await fetch(`/api/paid/nickname?player=${readPlayerId()}`);
      if (!response.ok || cancelled || nameTouched.current) return;
      const body = await response.json() as { nickname?: unknown };
      const saved = decreeNamePrefill(body.nickname);
      if (!cancelled && saved && !nameTouched.current) setName(saved);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const response = await fetch("/api/paid/catalog");
      if (!response.ok || cancelled) return;
      const next = await response.json() as Catalog;
      if (cancelled) return;
      setCatalog(next);
      if (!countryTouched.current) setCountry(initialPurchaseCountry(next.visitorCountry, next.countries));
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
      <DecreePreview edition={edition} score={score} name={previewName} />
      <form onSubmit={buy}>
        <label className="paid-field">Name on the decree
          <input value={name} onChange={(event) => { nameTouched.current = true; setName(event.target.value); }} maxLength={32} autoComplete="name" placeholder="Your name" required />
        </label>
        <label className="paid-field">Email address
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required maxLength={200} />
        </label>
        <label className="paid-field">Country
          <select value={country} required onChange={(event) => { countryTouched.current = true; setCountry(event.target.value); }}>
            <option value="" disabled>{CHOOSE_COUNTRY_LABEL}</option>
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

function DecreePreview({ edition, score, name }: { edition: string; score: number; name: string }) {
  const src = decreePreviewUrl(edition, score, name);
  const [shown, setShown] = useState("");
  const pending = shown !== src;
  return (
    <div className="royal-thumb-frame">
      {pending ? <div className="royal-thumb-skeleton" aria-hidden="true" /> : null}
      {/* eslint-disable-next-line @next/next/no-img-element -- low-res watermarked decree PNG, not a static asset */}
      <img
        className={pending ? "is-pending" : undefined}
        src={src}
        alt={name === DECREE_PREVIEW_NAME ? `Decree preview, ${score} of 12` : `Decree preview for ${name}, ${score} of 12`}
        width="360"
        height="450"
        loading="lazy"
        decoding="async"
        onLoad={(event) => { if (event.currentTarget.getAttribute("src") === src) setShown(src); }}
      />
    </div>
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
    <section className="royal-pack">
      <p className="royal-pack-summary"><b>{pack.displayName}</b>, {pack.tier}. Bride price {pack.bridePrice} cowries. Score {pack.score}/12. Certificate {pack.certificate}.</p>
      <p className="royal-pack-note">{pack.explanation}</p>
      {/* eslint-disable-next-line @next/next/no-img-element -- generated decree PNG, not a static asset */}
      <img src={pack.downloads.card} alt={`Royal Decree for ${pack.displayName}, ${pack.score} of 12`} width={360} />
      <CultureGems facts={pack.facts} />
      <p className="royal-downloads">
        <a href={pack.downloads.card}>Decree image</a>
        <a href={pack.downloads.story}>Story image</a>
        <a href={pack.downloads.pdf}>PDF</a>
        <a href={pack.downloads.zip}>Download bundle</a>
      </p>
    </section>
  );
}

function CultureGems({ facts }: { facts: Fact[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [active, setActive] = useState(0);

  function onScroll() {
    const row = scroller.current;
    if (!row) return;
    const cards = [...row.querySelectorAll<HTMLElement>(".gem-card")];
    const left = row.scrollLeft;
    let nearest = 0;
    let distance = Number.POSITIVE_INFINITY;
    cards.forEach((card, index) => {
      const gap = Math.abs(card.offsetLeft - left);
      if (gap < distance) {
        distance = gap;
        nearest = index;
      }
    });
    setActive(nearest);
  }

  function show(index: number) {
    const row = scroller.current;
    const card = row?.querySelectorAll<HTMLElement>(".gem-card")[index];
    if (!row || !card) return;
    row.scrollTo({
      left: card.offsetLeft,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
    setActive(index);
  }

  return (
    <section className="culture-gems" aria-label="Your Culture Gems">
      <p className="eyebrow">Your Culture Gems</p>
      <h3>What you uncovered</h3>
      <div className="gem-row" ref={scroller} onScroll={onScroll}>
        {facts.map((fact) => {
          const subject = gemSubject(fact.category);
          const full = displayFact(fact.answer, fact.quote);
          const clipped = clipFact(full);
          const expanded = Boolean(open[fact.id]);
          return (
            <article key={fact.id} className={`gem-card tone-${subject.tone}`}>
              <p className="gem-kicker"><span aria-hidden="true">{subject.emoji}</span> {subject.label}</p>
              <h4>{fact.answer}</h4>
              <p>{expanded || !clipped.clipped ? full : clipped.text}</p>
              {clipped.clipped ? (
                <button type="button" onClick={() => setOpen((current) => ({ ...current, [fact.id]: !current[fact.id] }))}>
                  {expanded ? "Show less" : "Read more"}
                </button>
              ) : null}
            </article>
          );
        })}
      </div>
      {facts.length > 1 ? (
        <div className="gem-dots" aria-label="Culture gem cards">
          {facts.map((fact, index) => (
            <button key={fact.id} type="button" className={index === active ? "is-on" : undefined} aria-label={`Show gem ${index + 1}`} aria-current={index === active ? "true" : undefined} onClick={() => show(index)} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
