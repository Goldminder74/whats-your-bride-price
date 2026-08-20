"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { questionsByRegion, RegionId, regions, resultTiers } from "./quizData";

type Screen = "intro" | "setup" | "quiz" | "result";

const canvasColours: Record<RegionId, { ink: string; ground: string; accent: string; second: string }> = {
  west: { ink: "#102f45", ground: "#f4dfbd", accent: "#c6542d", second: "#d79b2f" },
  east: { ink: "#3b241b", ground: "#f5e5ca", accent: "#b74731", second: "#16878a" },
  central: { ink: "#142d22", ground: "#ead4ad", accent: "#9b512c", second: "#2f7259" },
  north: { ink: "#173f7a", ground: "#f5dfb4", accent: "#c9693b", second: "#d49a28" },
  southern: { ink: "#14224b", ground: "#f4dcad", accent: "#eb5f46", second: "#008e9c" },
};

function getTier(score: number) {
  return [...resultTiers].reverse().find((tier) => score >= tier.min) ?? resultTiers[0];
}

function loadCanvasImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = source;
  });
}

export default function QuizClient() {
  const [screen, setScreen] = useState<Screen>("intro");
  const [regionId, setRegionId] = useState<RegionId | null>(null);
  const [playerName, setPlayerName] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState("");
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [showFact, setShowFact] = useState(false);
  const [shareStatus, setShareStatus] = useState("");
  const [nominee, setNominee] = useState("");
  const [nominatedBy, setNominatedBy] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedRegion = params.get("region") as RegionId | null;
    if (requestedRegion && regions.some((region) => region.id === requestedRegion)) setRegionId(requestedRegion);
    if (params.get("nominated") === "1") setNominatedBy(params.get("from") || "a friend");
  }, []);

  const region = regions.find((item) => item.id === regionId) ?? null;
  const questions = regionId ? questionsByRegion[regionId] : [];
  const question = questions[index];
  const displayedOptions = question ? question.options.map((_, optionIndex) => question.options[(optionIndex + index) % question.options.length]) : [];
  const score = useMemo(() => answers.reduce((sum, value) => sum + value, 0), [answers]);
  const percentage = Math.round((score / 120) * 100);
  const result = getTier(score);
  const themeClass = regionId ? `theme-${regionId}` : "theme-pan";

  function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPhotoError("");
    if (!file.type.startsWith("image/")) { setPhotoError("Please choose an image file."); return; }
    if (file.size > 8 * 1024 * 1024) { setPhotoError("Please choose a photo smaller than 8 MB."); return; }
    const reader = new FileReader();
    reader.onload = () => setPhoto(String(reader.result));
    reader.onerror = () => setPhotoError("That photo could not be read. Please try another one.");
    reader.readAsDataURL(file);
  }

  function beginQuiz() {
    if (!regionId) return;
    setIndex(0); setAnswers([]); setSelected(null); setShowFact(false); setShareStatus(""); setScreen("quiz");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function choose(optionIndex: number) {
    if (!showFact) { setSelected(optionIndex); setShowFact(true); }
  }

  function next() {
    if (selected === null || !question) return;
    const updated = [...answers, displayedOptions[selected].points];
    setAnswers(updated);
    if (index === questions.length - 1) { setScreen("result"); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    setIndex(index + 1); setSelected(null); setShowFact(false);
  }

  function backToRegions() {
    setScreen("setup"); setIndex(0); setAnswers([]); setSelected(null); setShowFact(false); setShareStatus("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function home() {
    setScreen("intro"); setIndex(0); setAnswers([]); setSelected(null); setShowFact(false); setShareStatus("");
  }

  async function makeResultCard() {
    if (!region || !regionId) throw new Error("Choose a region first");
    const colours = canvasColours[regionId];
    const canvas = document.createElement("canvas");
    canvas.width = 1080; canvas.height = 1350;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Card drawing is unavailable");

    context.fillStyle = colours.ground; context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = colours.ink; context.fillRect(0, 0, canvas.width, 118);
    context.fillStyle = colours.accent; context.beginPath(); context.arc(92, 92, 210, 0, Math.PI * 2); context.fill();
    context.fillStyle = colours.second; context.beginPath(); context.arc(1015, 1280, 280, 0, Math.PI * 2); context.fill();
    context.strokeStyle = colours.ink; context.lineWidth = 8;
    for (let step = 0; step < 5; step += 1) context.strokeRect(38 + step * 19, 175 + step * 19, 1004 - step * 38, 1120 - step * 38);

    context.textAlign = "center";
    context.fillStyle = "#ffffff"; context.font = "800 30px Arial"; context.fillText("WHAT'S YOUR BRIDE PRICE?", 540, 75);
    context.fillStyle = colours.ink; context.font = "800 26px Arial"; context.fillText(`${region.name.toUpperCase()} EDITION`, 540, 250);

    if (photo) {
      const portrait = await loadCanvasImage(photo);
      context.save(); context.beginPath(); context.arc(540, 450, 145, 0, Math.PI * 2); context.clip();
      const scale = Math.max(290 / portrait.width, 290 / portrait.height);
      const width = portrait.width * scale; const height = portrait.height * scale;
      context.drawImage(portrait, 540 - width / 2, 450 - height / 2, width, height); context.restore();
      context.strokeStyle = colours.accent; context.lineWidth = 15; context.beginPath(); context.arc(540, 450, 152, 0, Math.PI * 2); context.stroke();
    } else {
      context.fillStyle = colours.accent; context.beginPath(); context.arc(540, 450, 145, 0, Math.PI * 2); context.fill();
      context.fillStyle = "#ffffff"; context.font = "800 108px Georgia"; context.fillText(result.emoji, 540, 490);
    }

    context.fillStyle = colours.ink; context.font = "700 25px Arial"; context.fillText(playerName.trim() || "CULTURE CHALLENGER", 540, 650);
    context.font = "800 72px Georgia"; context.fillText(result.title, 540, 745);
    context.fillStyle = colours.accent; context.font = "800 126px Georgia"; context.fillText(`${percentage}%`, 540, 900);
    context.fillStyle = colours.ink; context.font = "700 24px Arial"; context.fillText("CULTURE CONNECTION", 540, 948);
    context.fillStyle = colours.second; context.fillRect(280, 1000, 520, 145);
    context.fillStyle = "#ffffff"; context.font = "800 54px Georgia"; context.fillText(result.cowries, 540, 1068);
    context.font = "800 22px Arial"; context.fillText("THEORETICAL GOLDEN COWRIES", 540, 1110);
    context.fillStyle = colours.ink; context.font = "600 20px Arial"; context.fillText("Human worth is priceless. Bragging rights only.", 540, 1225);

    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Card creation failed")), "image/png"));
    return new File([blob], "my-african-culture-quiz-result.png", { type: "image/png" });
  }

  function resultText() {
    return `${playerName.trim() || "I"} scored ${percentage}% and earned ${result.title} in the ${region?.name} edition of “What's Your Bride Price?” Can you beat that?`;
  }

  async function shareResult() {
    setShareStatus("");
    try {
      const card = await makeResultCard();
      const data = { title: "What's Your Bride Price?", text: resultText(), url: window.location.origin, files: [card] };
      if (navigator.share && navigator.canShare?.({ files: [card] })) await navigator.share(data);
      else if (navigator.share) await navigator.share({ title: data.title, text: data.text, url: data.url });
      else { await navigator.clipboard.writeText(`${data.text} ${data.url}`); setShareStatus("Result copied. Your personalised card is ready to download too."); }
    } catch (error) {
      if ((error as Error).name !== "AbortError") setShareStatus("Sharing did not open. Try downloading the card instead.");
    }
  }

  async function downloadResult() {
    try {
      const card = await makeResultCard();
      const link = document.createElement("a"); link.href = URL.createObjectURL(card); link.download = card.name; link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      setShareStatus("Your personalised result card has downloaded.");
    } catch { setShareStatus("The result card could not be created on this device."); }
  }

  function challengeLink() {
    const params = new URLSearchParams({ nominated: "1", region: regionId || "west" });
    if (playerName.trim()) params.set("from", playerName.trim());
    return `${window.location.origin}?${params.toString()}`;
  }

  function nominationText() {
    const person = nominee.trim() || "My friend";
    const sender = playerName.trim() || "A culture challenger";
    return `${person}, ${sender} has nominated you to take the ${region?.name} edition of “What's Your Bride Price?” Think you can beat ${percentage}%?`;
  }

  async function nominatePlayer() {
    const text = nominationText(); const url = challengeLink();
    try {
      if (navigator.share) await navigator.share({ title: "You have been nominated!", text, url });
      else { await navigator.clipboard.writeText(`${text} ${url}`); setShareStatus("Nomination link copied. Send it to your challenger."); }
    } catch (error) { if ((error as Error).name !== "AbortError") setShareStatus("The nomination could not be shared. Try WhatsApp instead."); }
  }

  function nominateOnWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(`${nominationText()} ${challengeLink()}`)}`, "_blank", "noreferrer");
  }

  if (screen === "intro") return (
    <main className={`experience ${themeClass}`}>
      <div className="grain" aria-hidden="true" /><div className="floating-beads" aria-hidden="true"><i /><i /><i /><i /><i /></div>
      <header className="masthead"><button className="brand" onClick={home}><span>W</span> What’s Your Bride Price?</button><span className="edition-tag">5 regional editions</span></header>
      <section className="landing-grid stage-enter">
        <div className="landing-copy">
          {nominatedBy && <p className="nomination-banner">✦ You were nominated by {nominatedBy}</p>}
          <p className="overline">A joyful African culture challenge</p>
          <h1>How deep do your <em>roots</em> run?</h1>
          <p className="intro-lede">Choose a region, add your portrait and collect a personalised culture title worth entirely imaginary golden cowries.</p>
          <div className="intro-actions"><button className="cta" onClick={() => setScreen("setup")}>Choose your region <span>↗</span></button><span>12 questions · about 3 minutes</span></div>
          <p className="respect-note"><b>For laughter and learning.</b> No woman has a monetary value. Every edition celebrates knowledge and curiosity without treating a region as one single culture.</p>
        </div>
        <div className="culture-collage" aria-label="Regional culture editions">
          {regions.map((item, itemIndex) => <button key={item.id} style={{ backgroundImage: `url(${item.art})`, "--turn": `${(itemIndex - 2) * 2.2}deg`, "--x": `${(itemIndex - 2) * 72}px`, "--lift": `${Math.abs(itemIndex - 2) * 7}px` } as React.CSSProperties} onClick={() => { setRegionId(item.id); setScreen("setup"); }}><span>{item.shortName}</span></button>)}
          <div className="collage-seal"><small>Pick your</small><strong>Region</strong><b>✦</b></div>
        </div>
      </section>
      <section className="feature-ribbon"><article><b>01</b><span>Upload your portrait</span></article><article><b>02</b><span>Play a regional edition</span></article><article><b>03</b><span>Share and nominate</span></article></section>
      <footer>Culture is living, local and wonderfully diverse.</footer>
    </main>
  );

  if (screen === "setup") return (
    <main className={`experience ${themeClass}`}>
      <div className="grain" aria-hidden="true" /><div className="floating-beads" aria-hidden="true"><i /><i /><i /><i /><i /></div>
      <header className="masthead"><button className="brand" onClick={home}><span>W</span> What’s Your Bride Price?</button><button className="text-button" onClick={home}>Back home</button></header>
      <section className="setup-heading stage-enter"><p className="overline">Create your culture passport</p><h1>Make it yours.</h1><p>Your portrait never leaves this device. It is used only to personalise the result card you choose to share or download.</p></section>
      <section className="setup-grid">
        <div className="identity-panel panel stage-enter delay-one">
          <div className="step-label"><span>01</span><div><b>Your portrait</b><small>Optional, but much more fun</small></div></div>
          <button className={`photo-drop ${photo ? "has-photo" : ""}`} onClick={() => fileInput.current?.click()} aria-label="Choose a portrait photo">
            {photo ? <img src={photo} alt="Your uploaded portrait" /> : <><span className="photo-icon">＋</span><b>Add your best photo</b><small>JPG, PNG or WebP · up to 8 MB</small></>}
            {photo && <span className="photo-change">Change photo</span>}
          </button>
          <input ref={fileInput} type="file" accept="image/*" onChange={handlePhoto} hidden />
          {photoError && <p className="form-error">{photoError}</p>}
          <label className="name-field"><span>First name or nickname</span><input value={playerName} onChange={(event) => setPlayerName(event.target.value.slice(0, 30))} placeholder="For your result card" /></label>
        </div>
        <div className="region-panel panel stage-enter delay-two">
          <div className="step-label"><span>02</span><div><b>Choose a region</b><small>Each has its own questions and visual world</small></div></div>
          <div className="region-list">
            {regions.map((item) => <button key={item.id} className={`region-choice ${regionId === item.id ? "active" : ""}`} onClick={() => setRegionId(item.id)} style={{ backgroundImage: `linear-gradient(90deg, rgba(15,12,16,.92), rgba(15,12,16,.34)), url(${item.art})` }}><span className="region-radio">{regionId === item.id ? "✓" : ""}</span><span><b>{item.name}</b><small>{item.invitation}</small></span></button>)}
          </div>
        </div>
      </section>
      {region && <section className="region-preview stage-enter"><img src={region.art} alt="" /><div><p className="overline">Your selected edition</p><h2>{region.name}</h2><p>{region.flavour}</p><button className="cta" onClick={beginQuiz}>Enter the {region.shortName} edition <span>→</span></button></div></section>}
      <p className="regional-note">Regional labels are broad navigation aids. Traditions cross borders, and every community contains its own histories and variations.</p>
    </main>
  );

  if (screen === "quiz" && region && question) return (
    <main className={`experience quiz-experience ${themeClass}`}>
      <div className="region-backdrop" style={{ backgroundImage: `url(${region.art})` }} aria-hidden="true" /><div className="grain" aria-hidden="true" />
      <header className="quiz-header"><button className="brand inverse" onClick={home}><span>W</span> WYBP?</button><div className="player-chip">{photo ? <img src={photo} alt="" /> : <span>{playerName.trim().charAt(0) || "✦"}</span>}<b>{playerName.trim() || "Culture Challenger"}</b></div><button className="region-chip" onClick={backToRegions}>{region.name} <span>⌄</span></button></header>
      <div className="quiz-progress"><span style={{ width: `${((index + 1) / questions.length) * 100}%` }} /><small>{String(index + 1).padStart(2, "0")} / {questions.length}</small></div>
      <section key={index} className="question-layout stage-question">
        <aside className="question-aside"><p>{question.category}</p><strong>{String(index + 1).padStart(2, "0")}</strong><span>{region.name}<br />culture edition</span><div className="mini-motif" /></aside>
        <article className="question-panel">
          <h1>{question.question}</h1>
          <div className="option-grid">
            {displayedOptions.map((option, optionIndex) => {
              const chosen = selected === optionIndex; const correct = option.points === 10;
              const state = showFact ? (correct ? "correct" : chosen ? "wrong" : "muted") : "";
              return <button key={option.label} className={`answer ${chosen ? "chosen" : ""} ${state}`} onClick={() => choose(optionIndex)}><span>{String.fromCharCode(65 + optionIndex)}</span><b>{option.label}</b>{showFact && correct && <i>✓</i>}</button>;
            })}
          </div>
          {showFact && <div className="culture-drop"><div className="burst" aria-hidden="true"><i /><i /><i /><i /><i /></div><p><b>Culture drop</b>{question.fact}</p><button className="cta compact" onClick={next}>{index === questions.length - 1 ? "Reveal my result" : "Next question"}<span>→</span></button></div>}
        </article>
      </section>
    </main>
  );

  if (!region) return null;
  return (
    <main className={`experience result-experience ${themeClass}`}>
      <div className="region-backdrop result-bg" style={{ backgroundImage: `url(${region.art})` }} aria-hidden="true" /><div className="grain" aria-hidden="true" /><div className="floating-beads" aria-hidden="true"><i /><i /><i /><i /><i /></div>
      <header className="masthead inverse-head"><button className="brand" onClick={home}><span>W</span> What’s Your Bride Price?</button><span className="edition-tag">{region.name} edition</span></header>
      <section className="reveal stage-reveal">
        <div className="portrait-reveal"><div className="portrait-rays" />{photo ? <img src={photo} alt={`${playerName || "Player"}'s portrait`} /> : <span>{result.emoji}</span>}<i className="crown">♛</i></div>
        <div className="result-copy"><p className="overline">The family council has spoken</p><small>{playerName.trim() ? `${playerName}, your` : "Your"} {region.name} culture connection is</small><h1>{result.title}</h1><p>{result.line}</p><div className="result-numbers"><div><strong>{percentage}%</strong><span>culture connection</span></div><div><strong>{result.cowries}</strong><span>theoretical golden cowries</span></div></div><p className="priceless">Human worth is priceless. The cowries are bragging rights, not a valuation.</p></div>
      </section>
      <section className="action-deck panel">
        <div><p className="overline">Make the group chat noisy</p><h2>Share your portrait card.</h2></div>
        <div className="action-buttons"><button className="cta" onClick={shareResult}>Share result <span>↗</span></button><button className="outline-button" onClick={downloadResult}>Download card</button></div>
        {shareStatus && <p className="share-status" role="status">{shareStatus}</p>}
      </section>
      <section className="nomination-deck">
        <div className="nomination-copy"><span className="nomination-medal">N</span><p className="overline">Pass the challenge</p><h2>Nominate your next player.</h2><p>Call out a friend by name and send them straight into the same regional edition.</p></div>
        <div className="nomination-form"><label><span>Who are you nominating?</span><input value={nominee} onChange={(event) => setNominee(event.target.value.slice(0, 40))} placeholder="Friend's first name" /></label><div><button className="cta" onClick={nominatePlayer}>Send nomination <span>→</span></button><button className="whatsapp-button" onClick={nominateOnWhatsApp}>WhatsApp</button></div></div>
      </section>
      <section className="result-footer-actions"><button className="text-button" onClick={beginQuiz}>Replay this edition</button><button className="text-button" onClick={backToRegions}>Choose another region</button></section>
      <footer>Every score opens another story.</footer>
    </main>
  );
}
