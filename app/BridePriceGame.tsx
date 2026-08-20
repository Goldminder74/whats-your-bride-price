"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

type RegionKey = "west" | "east" | "central" | "north" | "south";
type Screen = "home" | "setup" | "quiz" | "result";
type Question = { prompt: string; options: string[] };

const q = (prompt: string, ...options: string[]): Question => ({ prompt, options });

const regions: Record<RegionKey, {
  name: string; short: string; place: string; mark: string; hello: string;
  palette: string[]; drops: string[]; questions: Question[];
}> = {
  west: {
    name: "West Africa", short: "West", place: "From the Sahel to the Atlantic", mark: "✦", hello: "You’re entering a world of rhythm, wit & radiant hospitality.", palette: ["#bb3e22", "#f0a11a", "#2a160c"],
    drops: [
      "Timbuktu’s earthen architecture is a living record of scholarship, faith and Sahelian ingenuity.",
      "Across West Africa, oral historians and musicians have carried family and community memory across generations.",
      "Cloth, colour and dress can communicate occasion, belonging and personal expression — never a single fixed identity.",
    ],
    questions: [
      q("The family party starts at 2. When do you arrive?", "At 1:55, gift in hand", "At 2:30 — respectfully relaxed", "When the music gets serious", "I’m helping the host set up"),
      q("A jollof debate erupts at the table. You…", "Observe the diplomacy", "Defend your favourite with evidence", "Suggest a blind taste test", "Declare every pot a winner"),
      q("The drummer changes rhythm and the circle opens. Your move?", "Cheer from a safe distance", "Offer one excellent two-step", "Enter like I rehearsed for this", "Pull everyone in with me"),
      q("Your market-day superpower is…", "A beautifully organised list", "Spotting the finest details", "Warm conversation and good bargains", "Returning with gifts nobody requested"),
      q("A storyteller pauses at the best part. You…", "Wait in respectful suspense", "Guess the ending quietly", "Demand part two immediately", "Create a dramatic ending yourself"),
      q("Pick your celebration look.", "Quiet elegance", "One unforgettable detail", "Colour from head to toe", "A full entrance, no apologies"),
      q("The group chat has 147 unread messages. You…", "Read every single one", "Search for the important bit", "Reply with the perfect voice note", "Start a new, even livelier thread"),
      q("A guest says they’re not hungry. You…", "Respectfully offer once", "Prepare a small plate anyway", "Introduce them to the best dish", "Send them home with a full container"),
      q("Your road-trip role is…", "Route keeper", "Snack curator", "Music director", "Chief storyteller"),
      q("An elder gives unexpected advice. You…", "Listen and take notes", "Ask thoughtful questions", "Share how you see it too", "Turn it into a family proverb"),
      q("A friend needs help at short notice. You bring…", "A practical plan", "Useful introductions", "Food and calm energy", "The whole support squad"),
      q("At the final song, you are…", "Applauding from my seat", "On the edge of the dance floor", "Leading the favourite move", "Starting the after-party"),
    ],
  },
  east: {
    name: "East Africa", short: "East", place: "Highlands, coast & great lakes", mark: "◈", hello: "You’re entering a world of open horizons, layered traditions & generous welcome.", palette: ["#16746c", "#e4a82f", "#172f2c"],
    drops: [
      "The Oromo Gada system is an Indigenous democratic socio-political system recognised by UNESCO.",
      "Ugandan barkcloth making is a centuries-old knowledge practice involving the bark of the Mutuba tree.",
      "Seychellois Moutya is a dance and music tradition shaped by endurance, memory and community expression.",
    ],
    questions: [
      q("Coffee or tea is being prepared slowly and beautifully. You…", "Settle in and savour the ritual", "Ask how every step works", "Bring something sweet to share", "Turn the pause into a gathering"),
      q("The view opens across a huge horizon. Your first instinct?", "Breathe and take it in", "Find the best walking route", "Take one perfect photo", "Call everyone over to see"),
      q("A community discussion needs a way forward. You…", "Listen to every voice", "Map the common ground", "Offer a clear compromise", "Lift the room with possibility"),
      q("You meet an artisan working with barkcloth. You’re drawn to…", "The patience of the process", "The material’s texture", "The story carried by the craft", "How tradition keeps evolving"),
      q("Taarab floats across a coastal evening. You…", "Let the poetry wash over me", "Listen for every instrument", "Sway with whoever is nearby", "Make the evening a whole scene"),
      q("Your ideal shared meal has…", "A calm table and good talk", "A little of every flavour", "Second helpings for everyone", "Enough food for surprise guests"),
      q("A rainstorm changes the day’s plan. You…", "Enjoy the slower pace", "Invent a smart indoor plan", "Run out and laugh in it", "Turn it into a story worth retelling"),
      q("A friend teaches you a dance step. You…", "Practise it carefully", "Add a tiny personal flourish", "Commit before I’m ready", "Teach it to three more people"),
      q("On a long journey, you carry…", "Only the essentials", "A notebook and curiosity", "Perfect snacks", "Enough supplies for the whole vehicle"),
      q("Your strongest kind of courage is…", "Quiet consistency", "Speaking with honesty", "Trying the unfamiliar", "Helping others feel brave too"),
      q("At a neighbourhood celebration, you’re the…", "Thoughtful observer", "Useful extra pair of hands", "Warm welcome committee", "Unofficial master of ceremonies"),
      q("Choose your final flourish.", "A knowing smile", "A graceful bow", "A joyful ululation", "One more dance for everybody"),
    ],
  },
  central: {
    name: "Central Africa", short: "Central", place: "Rainforest heartlands", mark: "✺", hello: "You’re entering a world of forest abundance, river journeys & electric movement.", palette: ["#5e7935", "#d88f27", "#193b2b"],
    drops: [
      "The Congo Basin is one of the world’s great tropical forest regions and home to immense cultural and ecological diversity.",
      "Central African music has travelled globally through styles including soukous and rumba, always changing along the way.",
      "Raffia, wood, metal, pigment and cloth appear in many distinct artistic traditions across the region.",
    ],
    questions: [
      q("Rain drums on the roof during a gathering. You…", "Listen to the rhythm", "Move everyone somewhere cosy", "Start a song to match it", "Declare it perfect dance weather"),
      q("A river journey takes longer than expected. You…", "Enjoy the changing view", "Check the route and supplies", "Make friends with fellow travellers", "Turn the boat into a celebration"),
      q("Soukous guitar enters the song. Your shoulders…", "Remain admirably composed", "Begin a subtle conversation", "Understand the assignment", "Have already left the building"),
      q("You’re choosing a handmade piece. What wins you over?", "Precise craftsmanship", "An unexpected texture", "The maker’s story", "Something bold enough to inherit"),
      q("A feast has dishes you’ve never tried. You…", "Start with a careful taste", "Ask what pairs well together", "Build an adventurous plate", "Try everything and take notes"),
      q("Your friendship style is…", "Steady and dependable", "Honest and perceptive", "Warm and spontaneous", "A full community care package"),
      q("Someone begins a call-and-response. You…", "Learn the response first", "Join after the second round", "Answer with confidence", "Add harmony and recruit the room"),
      q("The power flickers mid-party. Your response?", "Find candles calmly", "Protect the food and speakers", "Lead an acoustic singalong", "Somehow make it more atmospheric"),
      q("A younger cousin asks for guidance. You…", "Give practical steps", "Ask what they really want", "Share a useful personal story", "Become their lifelong hype person"),
      q("Pick a weekend energy.", "Restoration and good food", "A creative project", "A spontaneous visit", "A house full of people"),
      q("Your signature entrance is…", "Quietly on time", "Warm greetings all round", "A look worth discussing", "Announced by the music"),
      q("The celebration ends. You’re the one…", "Stacking chairs", "Checking everyone got home", "Reliving the funniest moment", "Suggesting breakfast together"),
    ],
  },
  north: {
    name: "North Africa", short: "North", place: "Desert, delta & Mediterranean", mark: "☼", hello: "You’re entering a world of luminous courtyards, ancient cities & legendary welcome.", palette: ["#d7a856", "#1c7180", "#61341f"],
    drops: [
      "Timbuktu’s celebrated mosques and manuscripts reflect centuries of exchange across Saharan routes.",
      "North Africa holds Amazigh, Arab, Nubian, Saharan, Mediterranean and many other identities — no single story contains it.",
      "Courtyard architecture often turns shade, water, tile and geometry into practical beauty.",
    ],
    questions: [
      q("Mint tea arrives in a shining glass. You…", "Take in the aroma first", "Admire the pouring technique", "Settle in for a long conversation", "Ask who else is joining us"),
      q("You turn a corner in the old city and find a hidden courtyard. You…", "Enjoy the quiet", "Study every carved detail", "Photograph the light", "Imagine the dinner party"),
      q("A desert night reveals impossible stars. Your thought?", "Silence says enough", "I want to know every constellation", "This deserves poetry", "Everyone I love should see this"),
      q("At the souk, colour is everywhere. You choose…", "One timeless piece", "Something beautifully made", "A surprising pattern", "The object nobody can ignore"),
      q("A tray of shared food arrives. Your strategy?", "Begin politely", "Find the perfect combination", "Make sure everyone has enough", "Order the dish we forgot"),
      q("Music rises and someone ululates. You…", "Smile from the heart", "Join the clapping", "Answer with my own flourish", "Become pure celebration"),
      q("A family story has three competing versions. You…", "Hear each one out", "Investigate the timeline", "Choose the funniest", "Combine them into the legend"),
      q("Your design instinct favours…", "Clean symmetry", "Intricate geometry", "Rich colour and texture", "Layers that reveal themselves slowly"),
      q("A guest arrives unexpectedly. You…", "Make space at once", "Bring tea and something sweet", "Prepare a proper plate", "Turn one guest into a gathering"),
      q("The afternoon heat slows everything down. You…", "Rest without guilt", "Find a cool place to read", "Plan the evening", "Keep the stories flowing"),
      q("Your most magnetic quality is…", "Poise", "Curiosity", "Warmth", "Irresistible presence"),
      q("The night is ending. Your goodbye is…", "Graceful and brief", "A sincere thank-you", "Three more doorstep stories", "A promise to host next"),
    ],
  },
  south: {
    name: "Southern Africa", short: "South", place: "Savannah to the Cape", mark: "◆", hello: "You’re entering a world of bold horizons, deep community & future-facing rhythm.", palette: ["#693d79", "#e5a92d", "#173f49"],
    drops: [
      "Ubuntu is often expressed through the idea that personhood is realised in relationship with others.",
      "Beadwork traditions across Southern Africa are diverse visual languages, changing by people, place and time.",
      "Amapiano grew from South African townships into a global sound through collaboration, dance and digital circulation.",
    ],
    questions: [
      q("The braai is lit. What are you doing?", "Arranging plates and chairs", "Perfecting one signature dish", "Managing the playlist", "Inviting the neighbours too"),
      q("The amapiano log drum drops. You…", "Nod with deep appreciation", "Find the groove carefully", "Meet it with full footwork", "Pull the whole room onto the floor"),
      q("A friend says, “I am because we are.” You feel…", "Grounded", "Thoughtful", "Ready to contribute", "Determined to gather everyone"),
      q("You’re choosing beadwork. What catches your eye?", "Fine precision", "Meaningful pattern", "Unexpected colour", "A piece with maximum presence"),
      q("A road opens through a vast landscape. You…", "Enjoy the quiet miles", "Plan every beautiful stop", "Make the ultimate playlist", "Convoy with all my friends"),
      q("The weather gives four seasons in one day. You…", "Packed layers, obviously", "Adapt the plan calmly", "Laugh and continue", "Call it cinematic"),
      q("Your group needs a decision. You…", "Summarise the facts", "Make sure quieter voices speak", "Offer the brave option", "Build enthusiasm around a shared plan"),
      q("A cousin brings up lobola at dinner. You…", "Listen with respect", "Ask how traditions are changing", "Keep the talk warm and nuanced", "Remind everyone people are priceless"),
      q("The choir finds a perfect harmony. Your role?", "Absorb the goosebumps", "Hold one reliable note", "Add the joyful high part", "Conduct from the audience"),
      q("Your hospitality signature is…", "Everything thoughtfully ready", "The guest’s favourite thing", "Relaxed, generous energy", "Nobody leaves without leftovers"),
      q("A new creative idea feels risky. You…", "Test it quietly", "Find skilled collaborators", "Give it a bold first try", "Launch it and build the movement"),
      q("Your celebration finale is…", "A heartfelt toast", "A group photograph", "The song everyone knows", "Sunrise with the last dancers"),
    ],
  },
};

const regionOrder: RegionKey[] = ["west", "east", "central", "north", "south"];
const tierTitles = ["Quiet Treasure", "Golden Connector", "Radiant Storykeeper", "Celebration Legend"];
const tierCopy = [
  "Your power is in the details: thoughtful, grounded and quietly unforgettable.",
  "You make people feel seen. Warmth, wit and excellent timing are your signature.",
  "You bring stories to life and turn ordinary moments into shared memory.",
  "You don’t enter a room — you raise its temperature. Generosity follows wherever you go.",
];
const gifts = [
  ["8 symbolic cattle", "12 woven baskets", "one golden calabash"],
  ["14 symbolic cattle", "a chorus of drummers", "three trunks of celebration cloth"],
  ["21 symbolic cattle", "a caravan of good stories", "the best seat at every feast"],
  ["30 symbolic cattle", "a sky full of fireworks", "permanent main-character status"],
];

export default function BridePriceGame() {
  const [screen, setScreen] = useState<Screen>("home");
  const [regionKey, setRegionKey] = useState<RegionKey>("west");
  const [name, setName] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [dropOpen, setDropOpen] = useState(false);
  const [sound, setSound] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const region = regions[regionKey];
  const score = answers.reduce((sum, answer) => sum + answer + 1, 0);
  const tier = Math.min(3, Math.floor(Math.max(0, score - 12) / 10));

  useEffect(() => {
    const edition = new URLSearchParams(window.location.search).get("edition") as RegionKey | null;
    if (edition && regions[edition]) {
      setRegionKey(edition);
      setScreen("setup");
    }
  }, []);

  const playTone = (frequency = 420) => {
    if (!sound) return;
    try {
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, context.currentTime);
      gain.gain.setValueAtTime(.05, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .28);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + .3);
    } catch { /* sound is an optional flourish */ }
  };

  const chooseRegion = (key: RegionKey) => {
    setRegionKey(key);
    setScreen("setup");
    setAnswers([]);
    setIndex(0);
    window.history.replaceState({}, "", `?edition=${key}`);
    playTone(350 + regionOrder.indexOf(key) * 60);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const onPhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(String(reader.result));
    reader.readAsDataURL(file);
  };

  const beginQuiz = () => {
    setIndex(0); setAnswers([]); setSelected(null); setScreen("quiz");
    playTone(520); window.scrollTo(0, 0);
  };

  const answer = (answerIndex: number) => {
    if (selected !== null) return;
    setSelected(answerIndex); playTone(420 + answerIndex * 70);
    window.setTimeout(() => {
      const nextAnswers = [...answers, answerIndex];
      setAnswers(nextAnswers);
      if (index === 11) {
        setScreen("result"); setDropOpen(false); playTone(720);
      } else {
        setIndex((current) => current + 1);
        setSelected(null);
        if ((index + 1) % 3 === 0) setDropOpen(true);
      }
    }, 430);
  };

  const restart = () => {
    setScreen("home"); setAnswers([]); setIndex(0); setSelected(null); setPhoto(null);
    window.history.replaceState({}, "", window.location.pathname); window.scrollTo(0, 0);
  };

  const nominationUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}${window.location.pathname}?edition=${regionKey}&nominated=1`;
  }, [regionKey, screen]);

  const nominate = async () => {
    const text = `${name || "I"} just played the ${region.name} edition of What’s Your Bride Price? I nominate you next. Your turn!`;
    if (navigator.share) {
      try { await navigator.share({ title: "You’ve been nominated!", text, url: nominationUrl }); return; } catch { return; }
    }
    await navigator.clipboard?.writeText(`${text} ${nominationUrl}`);
    alert("Nomination link copied!");
  };

  const resultBlob = async (): Promise<Blob | null> => {
    const canvas = document.createElement("canvas");
    canvas.width = 1080; canvas.height = 1350;
    const ctx = canvas.getContext("2d"); if (!ctx) return null;
    const [base, accent, dark] = region.palette;
    ctx.fillStyle = base; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = .22; ctx.strokeStyle = accent; ctx.lineWidth = 12;
    for (let x = -400; x < 1400; x += 90) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 680, 1350); ctx.stroke(); }
    ctx.globalAlpha = 1; ctx.fillStyle = dark; ctx.fillRect(55, 55, 970, 1240);
    ctx.strokeStyle = accent; ctx.lineWidth = 3; ctx.strokeRect(78, 78, 924, 1194);
    ctx.textAlign = "center"; ctx.fillStyle = accent; ctx.font = "700 28px Arial";
    ctx.fillText(`${region.name.toUpperCase()} EDITION • CEREMONIAL SCORECARD`, 540, 145);
    if (photo) {
      const image = new Image(); image.src = photo; await image.decode();
      ctx.save(); ctx.beginPath(); ctx.arc(540, 370, 165, 0, Math.PI * 2); ctx.clip();
      const side = Math.min(image.width, image.height);
      ctx.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 375, 205, 330, 330); ctx.restore();
      ctx.strokeStyle = accent; ctx.lineWidth = 12; ctx.beginPath(); ctx.arc(540, 370, 172, 0, Math.PI * 2); ctx.stroke();
    } else {
      ctx.fillStyle = accent; ctx.font = "110px Georgia"; ctx.fillText(region.mark, 540, 410);
    }
    ctx.fillStyle = "#f3e7cc"; ctx.font = "italic 46px Georgia"; ctx.fillText(name || "A Most Excellent Human", 540, 625);
    ctx.fillStyle = accent; ctx.font = "900 84px Impact, Arial Black"; ctx.fillText(tierTitles[tier].toUpperCase(), 540, 735);
    ctx.fillStyle = "#f3e7cc"; ctx.font = "36px Georgia";
    ctx.fillText(gifts[tier][0].toUpperCase(), 540, 845);
    ctx.font = "italic 29px Georgia"; ctx.fillText(`+${gifts[tier][1]} + ${gifts[tier][2]}`, 540, 907);
    ctx.fillStyle = accent; ctx.font = "700 25px Arial"; ctx.fillText("PURELY PLAYFUL • PEOPLE ARE PRICELESS", 540, 1010);
    ctx.fillStyle = "#f3e7cc"; ctx.font = "900 58px Impact, Arial Black"; ctx.fillText("WHAT’S YOUR BRIDE PRICE?", 540, 1130);
    ctx.font = "24px Arial"; ctx.fillText("Play your region. Share your result. Nominate a friend.", 540, 1190);
    return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  };

  const downloadResult = async () => {
    const blob = await resultBlob(); if (!blob) return;
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `bride-price-${regionKey}-result.png`; anchor.click(); URL.revokeObjectURL(url);
  };

  const shareResult = async () => {
    const blob = await resultBlob();
    const file = blob ? new File([blob], "my-bride-price-result.png", { type: "image/png" }) : null;
    const shareData: ShareData = { title: "My playful bride price result", text: `I’m ${tierTitles[tier]} in the ${region.name} edition. People are priceless — but the bragging rights are real!`, url: nominationUrl };
    if (file && navigator.canShare?.({ files: [file] })) shareData.files = [file];
    if (navigator.share) { try { await navigator.share(shareData); } catch {} }
    else await downloadResult();
  };

  return (
    <main className={`game-shell theme-${regionKey} screen-${screen}`}>
      <div className="grain" aria-hidden="true" />
      <header className="topbar">
        <button className="wordmark wordmark-button" onClick={restart} aria-label="Return home">
          <span className="wordmark-seal">W</span>
          <span>WHAT’S YOUR<br /><strong>BRIDE PRICE?</strong></span>
        </button>
        <div className="nav-links">
          {screen === "home" && <a href="#editions">The editions</a>}
          <button className="text-nav" onClick={() => setMenuOpen(true)}>About the game</button>
          <button className="sound-button" onClick={() => setSound(!sound)} aria-label={sound ? "Turn sound off" : "Turn sound on"}><span>{sound ? "♪" : "×"}</span> Sound {sound ? "on" : "off"}</button>
        </div>
      </header>

      {screen === "home" && (
        <>
          <section className="hero" id="top">
            <div className="hero-kicker"><span /> A joyful journey across Africa <span /></div>
            <h1>HOW MANY COWS<br />ARE <em>YOU</em> WORTH?</h1>
            <p className="hero-copy">A playful celebration of personality, culture and the beautiful ways we show value — from Cairo to Cape Town.</p>
            <a className="primary-cta" href="#editions"><span>Choose your edition</span><b>↘</b></a>
            <div className="hero-stamp" aria-hidden="true"><span>5</span><small>REGIONS</small><i>60 STORIES</i></div>
            <div className="bead-string bead-one" aria-hidden="true" /><div className="bead-string bead-two" aria-hidden="true" />
            <div className="sun-orbit" aria-hidden="true"><span>✦</span></div>
          </section>
          <section className="edition-section" id="editions">
            <div className="section-heading">
              <p>01 — Pick your path</p>
              <h2>FIVE REGIONS.<br /><i>ENDLESS</i> BRAGGING RIGHTS.</h2>
              <span>Every edition is its own world — with 12 questions inspired by the region’s rhythms, rituals and everyday magic.</span>
            </div>
            <div className="region-grid">
              {regionOrder.map((key, cardIndex) => {
                const item = regions[key];
                return <article className={`region-card ${key}`} key={key} onClick={() => chooseRegion(key)}>
                  <div className="card-pattern" aria-hidden="true" /><div className="card-number">0{cardIndex + 1}</div>
                  <div className="card-mark" aria-hidden="true">{item.mark}</div>
                  <div className="card-copy"><p>{item.place}</p><h3>{item.name}</h3>
                    <button type="button" onClick={() => chooseRegion(key)} aria-label={`Play the ${item.name} edition`}>Enter this world <span>→</span></button>
                  </div>
                </article>;
              })}
            </div>
          </section>
          <section className="how-section">
            <p className="eyebrow">02 — How it works</p>
            <div className="how-intro"><h2>YOUR STORY.<br /><i>YOUR</i> SPOTLIGHT.</h2><p>Three joyful minutes to a portrait worth sharing.</p></div>
            <div className="steps">
              <div><b>01</b><span>Pick a region</span><p>Choose the edition you know, love or want to explore.</p></div>
              <div><b>02</b><span>Trust your instinct</span><p>Twelve quick questions. There are no wrong answers.</p></div>
              <div><b>03</b><span>Claim the reveal</span><p>Download your portrait and nominate the next player.</p></div>
            </div>
          </section>
          <section className="values-strip">
            <p>This game celebrates culture — it never measures human worth.</p>
            <div><span>12</span> questions <i>•</i> <span>3</span> minutes <i>•</i> <span>1</span> unforgettable reveal</div>
          </section>
        </>
      )}

      {screen === "setup" && (
        <section className="setup-stage">
          <div className="regional-backdrop"><span>{region.mark}</span></div>
          <button className="back-link" onClick={() => setScreen("home")}>← All editions</button>
          <div className="setup-copy">
            <p className="eyebrow">{region.place}</p>
            <h1>{region.name}<br /><i>Edition</i></h1>
            <p>{region.hello}</p>
            <div className="setup-meta"><span>12 questions</span><span>≈ 3 minutes</span><span>100% playful</span></div>
          </div>
          <div className="player-card">
            <div className="card-pin">YOUR PLAYER CARD</div>
            <button className={`photo-picker ${photo ? "has-photo" : ""}`} onClick={() => fileRef.current?.click()} aria-label="Choose an optional profile photograph">
              {photo ? <img src={photo} alt="Your selected portrait" /> : <><span>＋</span><b>Add your photo</b><small>Optional</small></>}
            </button>
            <input ref={fileRef} type="file" accept="image/*" onChange={onPhoto} hidden />
            <label htmlFor="player-name">What should we call you?</label>
            <input id="player-name" value={name} onChange={(e) => setName(e.target.value.slice(0, 30))} placeholder="Your name (optional)" />
            <p className="privacy-note"><span>⌁</span> Your photo stays on this device. It is never uploaded.</p>
            <button className="big-action" onClick={beginQuiz}>Begin the journey <span>→</span></button>
          </div>
        </section>
      )}

      {screen === "quiz" && (
        <section className="quiz-stage">
          <div className="quiz-pattern" aria-hidden="true" />
          <div className="quiz-header">
            <button onClick={() => setScreen("setup")}>← Exit</button>
            <div><span>{region.name} edition</span><b>{String(index + 1).padStart(2, "0")} / 12</b></div>
          </div>
          <div className="progress-track"><span style={{ width: `${((index + 1) / 12) * 100}%` }} /></div>
          <div className="question-wrap" key={index}>
            <p className="eyebrow">Trust your first instinct</p>
            <h2>{region.questions[index].prompt}</h2>
            <div className="answer-grid">
              {region.questions[index].options.map((option, optionIndex) =>
                <button key={option} className={selected === optionIndex ? "selected" : ""} onClick={() => answer(optionIndex)}>
                  <span>{String.fromCharCode(65 + optionIndex)}</span><b>{option}</b><i>↗</i>
                </button>
              )}
            </div>
          </div>
          <div className="quiz-footer"><span>{region.mark}</span><p>There are no right answers — only your energy.</p></div>
          {dropOpen && (
            <div className="culture-drop" role="dialog" aria-modal="true" aria-label="Culture drop">
              <div className="drop-card"><button onClick={() => setDropOpen(false)} aria-label="Close">×</button><span>{region.mark}</span><p>Culture drop</p>
                <h3>{region.drops[Math.floor(index / 3) % region.drops.length]}</h3>
                <small>One glimpse, never the whole story. Every region contains many peoples, languages and experiences.</small>
                <button className="drop-next" onClick={() => setDropOpen(false)}>Keep playing →</button>
              </div>
            </div>
          )}
        </section>
      )}

      {screen === "result" && (
        <section className="result-stage">
          <div className="confetti" aria-hidden="true">{Array.from({ length: 24 }, (_, i) => <i key={i} style={{ "--i": i } as React.CSSProperties} />)}</div>
          <p className="result-kicker">{region.name} edition • official ceremonial scorecard</p>
          <div className="result-layout">
            <div className="result-card">
              <div className="result-frame">
                <div className="result-region">{region.mark} {region.short.toUpperCase()} AFRICA {region.mark}</div>
                <div className={`result-portrait ${photo ? "with-image" : ""}`}>{photo ? <img src={photo} alt="" /> : <span>{region.mark}</span>}</div>
                <p>{name || "A Most Excellent Human"}</p>
                <h1>{tierTitles[tier]}</h1>
                <div className="result-gift"><b>{gifts[tier][0]}</b><span>+ {gifts[tier][1]}<br />+ {gifts[tier][2]}</span></div>
                <small>Purely playful • People are priceless</small>
              </div>
            </div>
            <div className="result-copy">
              <p className="eyebrow">The grand reveal</p><h2>THE VERDICT<br />IS <i>IN.</i></h2>
              <p className="result-description">{tierCopy[tier]}</p>
              <div className="worth-note"><span>♡</span><p><b>A note on worth</b>This result is a cultural conversation starter, not a valuation. Your dignity cannot be counted, traded or scored.</p></div>
              <div className="result-actions"><button className="big-action" onClick={shareResult}>Share my portrait <span>↗</span></button><button className="outline-action" onClick={downloadResult}>↓ Download</button></div>
              <button className="nominate-action" onClick={nominate}><span>＋</span><b>Nominate a friend</b><small>Sends them straight to the {region.short} edition</small><i>→</i></button>
              <a className="whatsapp-link" href={`https://wa.me/?text=${encodeURIComponent(`I nominate you for the ${region.name} edition of What’s Your Bride Price? ${nominationUrl}`)}`} target="_blank" rel="noreferrer">Send nomination on WhatsApp ↗</a>
              <button className="play-again" onClick={restart}>Play another edition</button>
            </div>
          </div>
        </section>
      )}

      {menuOpen && (
        <div className="about-modal" role="dialog" aria-modal="true" aria-label="About this game">
          <div className="about-sheet"><button className="modal-close" onClick={() => setMenuOpen(false)}>×</button>
            <p className="eyebrow">About this experience</p><h2>JOY WITH<br /><i>CONTEXT.</i></h2>
            <p>“Bride price” practices are diverse, evolving and understood differently across communities. This game uses the phrase with humour while refusing the idea that any person can be reduced to a price.</p>
            <div className="guardrails"><div><b>People are priceless</b><span>Scores are fictional, celebratory and never claims about real customs or human value.</span></div><div><b>Africa is plural</b><span>Five playful editions cannot represent thousands of cultures. They are invitations to curiosity, not definitions.</span></div><div><b>Your portrait is private</b><span>Photos are processed in your browser and are never uploaded or stored by this app.</span></div></div>
            <p className="source-label">Cultural starting points</p>
            <div className="source-links">
              <a href="https://ich.unesco.org/en/RL/gada-system-an-indigenous-democratic-socio-political-system-of-the-oromo-01164" target="_blank" rel="noreferrer">Oromo Gada system ↗</a>
              <a href="https://ich.unesco.org/en/RL/barkcloth-making-in-uganda-00139" target="_blank" rel="noreferrer">Ugandan barkcloth ↗</a>
              <a href="https://ich.unesco.org/en/RL/moutya-01690" target="_blank" rel="noreferrer">Seychellois Moutya ↗</a>
              <a href="https://whc.unesco.org/en/list/119/" target="_blank" rel="noreferrer">Timbuktu ↗</a>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
