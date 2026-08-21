"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { avatarChoices as educationalAvatarChoices, regionOrder as educationalRegionOrder, regions as educationalRegions, sourceCollections } from "./gameData";

type RegionKey = "west" | "east" | "central" | "north" | "south";
type Screen = "home" | "setup" | "quiz" | "result";
type Question = { prompt: string; options: string[] };

const q = (prompt: string, ...options: string[]): Question => ({ prompt, options });

const legacyRegions: Record<RegionKey, {
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
      q("A cousin brings up lobola at dinner. You…", "Listen with respect", "Ask how traditions are changing", "Keep the talk warm and nuanced", "Ask one more thoughtful question"),
      q("The choir finds a perfect harmony. Your role?", "Absorb the goosebumps", "Hold one reliable note", "Add the joyful high part", "Conduct from the audience"),
      q("Your hospitality signature is…", "Everything thoughtfully ready", "The guest’s favourite thing", "Relaxed, generous energy", "Nobody leaves without leftovers"),
      q("A new creative idea feels risky. You…", "Test it quietly", "Find skilled collaborators", "Give it a bold first try", "Launch it and build the movement"),
      q("Your celebration finale is…", "A heartfelt toast", "A group photograph", "The song everyone knows", "Sunrise with the last dancers"),
    ],
  },
};

const legacyRegionOrder: RegionKey[] = ["west", "east", "central", "north", "south"];
const legacyAvatarChoices = [
  { name: "Amara", src: "/avatars/amara.webp", vibe: "The Radiant One" },
  { name: "Zuri", src: "/avatars/zuri.webp", vibe: "The Wild Card" },
  { name: "Nia", src: "/avatars/nia.webp", vibe: "The Story Charmer" },
  { name: "Lindi", src: "/avatars/lindi.webp", vibe: "The Joy Bringer" },
  { name: "Imara", src: "/avatars/imara.webp", vibe: "The Power Move" },
  { name: "Aya", src: "/avatars/aya.webp", vibe: "The Golden Hour" },
];
const regions = educationalRegions;
const regionOrder = educationalRegionOrder;
const avatarChoices = educationalAvatarChoices;
const stampNames: Record<RegionKey, string[]> = {
  west: ["Story Keeper", "Rhythm Caller", "Table Diplomat", "Golden Host"],
  east: ["Horizon Seeker", "Coffee Circle", "Coast Connector", "Open Sky"],
  central: ["Forest Pulse", "Rumba Spark", "River Memory", "Joy Amplifier"],
  north: ["Medina Eye", "Desert Star", "Tea Poet", "Courtyard Light"],
  south: ["Ubuntu Heart", "Amapiano Step", "Bold Horizon", "Community Fire"],
};
const tierTitles = ["Soft-Life Strategist", "Group-Chat Oracle", "Motherland Main Character", "The Aunties’ Final Boss"];
const tierCopy = [
  "Calm face, elite instincts. You move softly, choose beautifully and somehow still get the best seat.",
  "You read the room, save the function and always have the voice note everybody forwards.",
  "You bring stories to life and turn ordinary moments into shared memory. The camera finds you by itself.",
  "You didn’t pass the vibe check. You ARE the vibe check. The family council has adjourned.",
];
const gifts = [
  ["8 legendary cowries", "a year of soft landings", "the last perfect plantain"],
  ["14 legendary cowries", "admin rights to the group chat", "three trunks of main-character fabric"],
  ["21 legendary cowries", "a caravan of good stories", "front-row status at every function"],
  ["30 legendary cowries", "the aunties’ standing ovation", "permanent main-character immunity"],
];
const kindLabels = { single: "ONE ANSWER", multi: "SELECT THREE", complete: "COMPLETE THE SENTENCE", image: "IMAGE CHALLENGE" } as const;

export default function BridePriceGame() {
  const [screen, setScreen] = useState<Screen>("home");
  const [regionKey, setRegionKey] = useState<RegionKey>("west");
  const [name, setName] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [avatar, setAvatar] = useState(avatarChoices[0].src);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [lastCorrect, setLastCorrect] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);
  const [sound, setSound] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [completedRegions, setCompletedRegions] = useState<RegionKey[]>([]);
  const [revealAura, setRevealAura] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const region = regions[regionKey];
  const question = region.questions[index];
  const portrait = photo || avatar;
  const correctCount = answers.reduce((sum, answer) => sum + answer, 0);
  const tier = Math.min(3, Math.floor(correctCount / 3));
  const aura = answers.reduce((sum, answer) => sum + (answer ? 150 : 45), 0);
  let streak = 0;
  for (let i = answers.length - 1; i >= 0 && answers[i] === 1; i -= 1) streak += 1;
  const stamps = Math.floor(answers.length / 3);

  useEffect(() => {
    const edition = new URLSearchParams(window.location.search).get("edition") as RegionKey | null;
    if (edition && regions[edition]) {
      setRegionKey(edition);
      setScreen("setup");
    }
    try {
      const saved = JSON.parse(localStorage.getItem("wybp-passport") || "[]") as RegionKey[];
      setCompletedRegions(saved.filter((key) => regions[key]));
    } catch { /* device progress is optional */ }
  }, []);

  useEffect(() => {
    if (screen !== "result") return;
    const next = Array.from(new Set([...completedRegions, regionKey])) as RegionKey[];
    setCompletedRegions(next);
    try { localStorage.setItem("wybp-passport", JSON.stringify(next)); } catch {}
    setRevealAura(0);
    const target = aura + 500;
    let frame = 0;
    const timer = window.setInterval(() => {
      frame += 1;
      setRevealAura(Math.round(target * Math.min(1, frame / 34)));
      if (frame >= 34) window.clearInterval(timer);
    }, 28);
    return () => window.clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  const playTone = (frequency = 420, flourish = false) => {
    if (!sound) return;
    try {
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const context = audioRef.current || new AudioContextClass();
      audioRef.current = context;
      if (context.state === "suspended") void context.resume();
      const regionalIntervals: Record<RegionKey, number[]> = {
        west: [1, 1.25, 1.5], east: [1, 1.2, 1.6], central: [1, 1.333, 1.666],
        north: [1, 1.125, 1.5], south: [1, 1.25, 1.75],
      };
      const notes = flourish ? regionalIntervals[regionKey] : [1];
      notes.forEach((interval, noteIndex) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = noteIndex % 2 ? "triangle" : "sine";
        const start = context.currentTime + noteIndex * .075;
        oscillator.frequency.setValueAtTime(frequency * interval, start);
        gain.gain.setValueAtTime(.0001, start);
        gain.gain.exponentialRampToValueAtTime(.055, start + .018);
        gain.gain.exponentialRampToValueAtTime(.001, start + .34);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(start); oscillator.stop(start + .36);
      });
      if (flourish) {
        const buffer = context.createBuffer(1, context.sampleRate * .12, context.sampleRate);
        const channel = buffer.getChannelData(0);
        for (let i = 0; i < channel.length; i += 1) channel[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / channel.length, 4);
        const noise = context.createBufferSource(); const noiseGain = context.createGain();
        noise.buffer = buffer; noiseGain.gain.value = .04; noise.connect(noiseGain).connect(context.destination); noise.start();
      }
      navigator.vibrate?.(flourish ? [18, 35, 22] : 12);
    } catch { /* sound is an optional flourish */ }
  };

  const chooseRegion = (key: RegionKey) => {
    setRegionKey(key);
    setScreen("setup");
    setAnswers([]);
    setIndex(0);
    window.history.replaceState({}, "", `?edition=${key}`);
    playTone(350 + regionOrder.indexOf(key) * 60, true);
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
    setIndex(0); setAnswers([]); setSelected([]); setFeedbackOpen(false); setScreen("quiz");
    playTone(520, true); window.scrollTo(0, 0);
  };

  const submitAnswer = (choice: number[]) => {
    if (feedbackOpen) return;
    const expected = region.questions[index].correct;
    const isCorrect = choice.length === expected.length && [...choice].sort().every((value, i) => value === [...expected].sort()[i]);
    setSelected(choice); setLastCorrect(isCorrect); setAnswers((current) => [...current, isCorrect ? 1 : 0]); setFeedbackOpen(true);
    playTone(isCorrect ? 680 : 260, isCorrect);
  };

  const chooseAnswer = (answerIndex: number) => {
    if (feedbackOpen) return;
    const question = region.questions[index];
    if (question.kind === "multi") {
      setSelected((current) => current.includes(answerIndex) ? current.filter((value) => value !== answerIndex) : current.length < 3 ? [...current, answerIndex] : current);
      playTone(390 + answerIndex * 35);
    } else {
      submitAnswer([answerIndex]);
    }
  };

  const nextQuestion = () => {
    if (index === 11) {
      setScreen("result"); setDropOpen(false); playTone(720, true);
    } else {
      setIndex((current) => current + 1); setSelected([]); setFeedbackOpen(false);
      if ((index + 1) % 3 === 0) setDropOpen(true);
    }
  };

  const restart = () => {
    setScreen("home"); setAnswers([]); setIndex(0); setSelected([]); setFeedbackOpen(false); setPhoto(null);
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
    const worldArt = new Image(); worldArt.src = `/regions/${regionKey === "south" ? "southern" : regionKey}-africa.webp`; await worldArt.decode();
    ctx.save(); ctx.globalAlpha = .48; ctx.drawImage(worldArt, 0, 0, worldArt.width, worldArt.height, 0, 0, 1080, 1350); ctx.restore();
    const veil = ctx.createLinearGradient(0, 0, 0, 1350); veil.addColorStop(0, `${dark}99`); veil.addColorStop(.52, `${dark}dd`); veil.addColorStop(1, dark); ctx.fillStyle = veil; ctx.fillRect(0, 0, 1080, 1350);
    ctx.globalAlpha = .22; ctx.strokeStyle = accent; ctx.lineWidth = 12;
    for (let x = -400; x < 1400; x += 90) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 680, 1350); ctx.stroke(); }
    ctx.globalAlpha = 1; ctx.fillStyle = dark; ctx.fillRect(55, 55, 970, 1240);
    ctx.strokeStyle = accent; ctx.lineWidth = 3; ctx.strokeRect(78, 78, 924, 1194);
    ctx.textAlign = "center"; ctx.fillStyle = accent; ctx.font = "700 28px Arial";
    ctx.fillText(`${region.name.toUpperCase()} EDITION • CEREMONIAL SCORECARD`, 540, 145);
    if (portrait) {
      const image = new Image(); image.src = portrait; await image.decode();
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
    ctx.fillStyle = accent; ctx.font = "700 25px Arial"; ctx.fillText(`KNOWLEDGE SCORE ${correctCount}/12 • ${region.name.toUpperCase()}`, 540, 1010);
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
    const shareData: ShareData = { title: "My Bride Price culture-game result", text: `I scored ${correctCount}/12 and unlocked ${tierTitles[tier]} in the ${region.name} edition. Can you beat me?`, url: nominationUrl };
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
          {screen === "home" && <span className="passport-mini">Passport <b>{completedRegions.length}/5</b></span>}
          <button className="text-nav" onClick={() => setMenuOpen(true)}>About the game</button>
          <button className="sound-button" onClick={() => setSound(!sound)} aria-label={sound ? "Turn sound off" : "Turn sound on"}><span>{sound ? "♪" : "×"}</span> Sound {sound ? "on" : "off"}</button>
        </div>
      </header>

      {screen === "home" && (
        <>
          <section className="cinema-hero" id="top">
            <div className="cinema-glow" aria-hidden="true" />
            <div className="cinema-copy">
              <div className="live-pill"><i /> The Motherland is calling</div>
              <p className="cinema-kicker">A cinematic pan-African knowledge quest</p>
              <h1>YOUR ROOTS.<br />YOUR RULES.<br /><em>YOUR REVEAL.</em></h1>
              <p>Pick a world. Decode proverbs. Spot the dish. Trace an empire. Leave with facts—and a portrait—the group chat cannot ignore.</p>
              <div className="cinema-actions">
                <button className="play-now" onClick={() => setScreen("setup")}><span>▶</span> Start the challenge</button>
                <button className="trailer-button" onClick={() => setMenuOpen(true)}><span>ⓘ</span> What is this?</button>
              </div>
              <div className="hero-stats"><span><b>5</b> worlds</span><span><b>60</b> challenges</span><span><b>12</b> avatar heroes</span></div>
            </div>
            <div className="cinema-visual" aria-label="Five regional game worlds">
              {regionOrder.map((key, artIndex) => <button key={key} className={`world-poster world-${artIndex + 1}`} onClick={() => chooseRegion(key)}>
                <img src={`/regions/${key === "south" ? "southern" : key}-africa.webp`} alt={`${regions[key].name} illustrated game world`} />
                <span><small>World 0{artIndex + 1}</small>{regions[key].name}</span>
              </button>)}
              <div className="orbit-copy"><span>CHOOSE</span><b>YOUR</b><em>WORLD</em></div>
            </div>
            <div className="game-marquee"><span>⚡ AVATAR LAB</span><span>✦ IMAGE ROUNDS</span><span>◉ CULTURE GEMS</span><span>♬ REACTIVE SOUND</span><span>↗ SHAREABLE REVEALS</span></div>
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
                  <img className="region-art" src={`/regions/${key === "south" ? "southern" : key}-africa.webp`} alt="" />
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
              <div><b>02</b><span>Crack the culture</span><p>Images, proverbs, languages, history and select-three challenges.</p></div>
              <div><b>03</b><span>Learn + reveal</span><p>Get the story behind every answer, then claim your regional portrait.</p></div>
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
          <div className="regional-backdrop"><img src={`/regions/${regionKey === "south" ? "southern" : regionKey}-africa.webp`} alt="" /><span>{region.mark}</span></div>
          <button className="back-link" onClick={() => setScreen("home")}>← All editions</button>
          <div className="setup-copy">
            <p className="eyebrow">{region.place}</p>
            <h1>{region.name}<br /><i>Edition</i></h1>
            <p>{region.hello}</p>
            <div className="setup-meta"><span>12 questions</span><span>≈ 3 minutes</span><span>100% playful</span></div>
          </div>
          <div className="player-card">
            <div className="card-pin"><span>AVATAR LAB</span><b>Choose your player</b></div>
            <div className="avatar-hero">
              <img src={portrait} alt="Your selected player portrait" />
              <div><span>{photo ? "Custom icon" : avatarChoices.find((item) => item.src === avatar)?.name}</span><b>{photo ? "One of one" : avatarChoices.find((item) => item.src === avatar)?.vibe}</b></div>
              <i>READY</i>
            </div>
            <div className="avatar-grid" aria-label="Choose an African avatar">
              {avatarChoices.map((item) => <button key={item.name} className={!photo && avatar === item.src ? "active" : ""} onClick={() => { setAvatar(item.src); setPhoto(null); playTone(470, true); }} aria-label={`Choose ${item.name}, ${item.vibe}`}><img src={item.src} alt="" /><span>{item.name}</span></button>)}
            </div>
            <button className="upload-own" onClick={() => fileRef.current?.click()}><span>＋</span><b>Or upload your own icon</b><small>Private. Never leaves your device.</small></button>
            <input ref={fileRef} type="file" accept="image/*" onChange={onPhoto} hidden />
            <label htmlFor="player-name">What should we call you?</label>
            <input id="player-name" value={name} onChange={(e) => setName(e.target.value.slice(0, 30))} placeholder="Your name (optional)" />
            <button className="big-action" onClick={beginQuiz}>Enter world 0{regionOrder.indexOf(regionKey) + 1} <span>▶</span></button>
          </div>
        </section>
      )}

      {screen === "quiz" && (
        <section className="quiz-stage">
          <div className="quiz-pattern" aria-hidden="true" />
          <div className="quiz-header">
            <button onClick={() => setScreen("setup")}>← Exit</button>
            <div className="quiz-player"><img src={portrait} alt="" /><span>{name || "Player one"}</span></div>
            <div className="game-hud">
              <span className="hud-edition">{region.name}</span>
              <span className="hud-aura"><i>✦</i><b>{aura}</b> aura</span>
              <span className="hud-streak"><i>⚡</i><b>{streak}</b> streak</span>
              <span className="hud-stamps"><i>◉</i><b>{stamps}</b>/4 gems</span>
              <b className="hud-round">{String(index + 1).padStart(2, "0")} / 12</b>
            </div>
          </div>
          <div className="progress-track"><span style={{ width: `${((index + 1) / 12) * 100}%` }} /></div>
          <div className="question-wrap" key={index}>
            <div className="question-meta"><p className="eyebrow">{kindLabels[question.kind]}</p><span>{question.topic}</span></div>
            <h2 className={question.kind === "image" ? "image-question" : question.kind === "complete" ? "sentence-question" : ""}>{question.prompt}</h2>
            <div className={`answer-grid kind-${question.kind}`}>
              {question.options.map((option, optionIndex) => {
                const slot = (question.visualStart || 0) + optionIndex;
                const classes = [selected.includes(optionIndex) ? "selected" : "", feedbackOpen && question.correct.includes(optionIndex) ? "correct" : "", feedbackOpen && selected.includes(optionIndex) && !question.correct.includes(optionIndex) ? "wrong" : ""].filter(Boolean).join(" ");
                return <button key={option} className={classes} onClick={() => chooseAnswer(optionIndex)} disabled={feedbackOpen}>
                  {question.kind === "image" && <span className="answer-image" style={{ backgroundImage: `url(/quiz-art/${regionKey}-atlas.webp)`, backgroundPosition: `${[0, 33.333, 66.667, 100][slot % 4]}% ${slot < 4 ? 0 : 100}%` }} aria-hidden="true" />}
                  <span className="answer-letter">{String.fromCharCode(65 + optionIndex)}</span><b>{option}</b><i>{question.kind === "multi" ? selected.includes(optionIndex) ? "✓" : "+" : "↗"}</i>
                </button>
              })}
            </div>
            {question.kind === "multi" && !feedbackOpen && <button className="lock-answer" disabled={selected.length !== 3} onClick={() => submitAnswer(selected)}>Lock in {selected.length}/3 answers <span>→</span></button>}
            {feedbackOpen && <div className={`answer-reveal ${lastCorrect ? "is-correct" : "is-learning"}`} role="status">
              <div><span>{lastCorrect ? "✦ CORRECT" : "◇ NOW YOU KNOW"}</span><b>{lastCorrect ? "Culture gem energy!" : "Good guess. Bank this fact."}</b></div>
              <p>{question.explanation}</p>
              <button onClick={nextQuestion}>{index === 11 ? "Reveal my result" : "Next challenge"} <span>→</span></button>
            </div>}
          </div>
          <div className="quiz-footer"><span>{region.mark}</span><p>Right or wrong, every reveal teaches you something worth carrying forward.</p></div>
          {dropOpen && (
            <div className="culture-drop" role="dialog" aria-modal="true" aria-label="Culture drop">
              <div className="drop-card"><button onClick={() => setDropOpen(false)} aria-label="Close">×</button>
                <div className="drop-art"><img src={`/regions/${regionKey === "south" ? "southern" : regionKey}-africa.webp`} alt="" /><span>{region.mark}</span></div>
                <div className="gem-unlocked"><i>◆</i><span>Culture gem unlocked</span><b>{stampNames[regionKey][Math.max(0, stamps - 1)]}</b></div>
                <p>One beautiful thing to know</p>
                <h3>{region.drops[Math.max(0, Math.ceil(index / 3) - 1) % region.drops.length]}</h3>
                <small>One glimpse, never the whole story. Every region contains many peoples, languages and experiences.</small>
                <button className="drop-next" onClick={() => { setDropOpen(false); playTone(610, true); }}>Claim gem + keep playing →</button>
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
              <img className="result-world-art" src={`/regions/${regionKey === "south" ? "southern" : regionKey}-africa.webp`} alt="" />
              <div className="result-frame">
                <div className="result-region">{region.mark} {region.short.toUpperCase()} AFRICA {region.mark}</div>
                <div className="result-portrait with-image"><img src={portrait} alt="" /></div>
                <p>{name || "A Most Excellent Human"}</p>
                <h1>{tierTitles[tier]}</h1>
                <div className="result-gift"><b>{gifts[tier][0]}</b><span>+ {gifts[tier][1]}<br />+ {gifts[tier][2]}</span></div>
                <div className="result-gems">{stampNames[regionKey].map((stamp) => <i key={stamp} title={stamp}>◆</i>)}</div>
                <small>Knowledge score {correctCount}/12 • {region.short} Africa</small>
              </div>
            </div>
            <div className="result-copy">
              <p className="eyebrow">The grand reveal</p><h2>THE VERDICT<br />IS <i>IN.</i></h2>
              <p className="result-description">{tierCopy[tier]}</p>
              <div className="result-aura"><span>Final aura</span><b>{revealAura.toLocaleString()}</b><i>+500 reveal bonus</i></div>
              <div className="worth-note knowledge-note"><span>✦</span><p><b>Your knowledge glow</b>You answered {correctCount} of 12 correctly and unlocked every explanation along the way.</p></div>
              <div className="result-actions"><button className="big-action" onClick={shareResult}>Share my portrait <span>↗</span></button><button className="outline-action" onClick={downloadResult}>↓ Download</button></div>
              <button className="nominate-action" onClick={nominate}><span>＋</span><b>Nominate a friend</b><small>Sends them straight to the {region.short} edition</small><i>→</i></button>
              <a className="whatsapp-link" href={`https://wa.me/?text=${encodeURIComponent(`I nominate you for the ${region.name} edition of What’s Your Bride Price? ${nominationUrl}`)}`} target="_blank" rel="noreferrer">Send nomination on WhatsApp ↗</a>
              <div className="passport-progress"><span>Motherland passport</span><div>{regionOrder.map((key) => <i key={key} className={completedRegions.includes(key) ? "earned" : ""}>{regions[key].mark}</i>)}</div><b>{completedRegions.length}/5 worlds explored</b></div>
              <button className="play-again" onClick={restart}>Play another edition</button>
            </div>
          </div>
        </section>
      )}

      {menuOpen && (
        <div className="about-modal" role="dialog" aria-modal="true" aria-label="About this game">
          <div className="about-sheet"><button className="modal-close" onClick={() => setMenuOpen(false)}>×</button>
            <p className="eyebrow">About this experience</p><h2>PLAY THE MAP.<br /><i>LEAVE BRILLIANT.</i></h2>
            <p>Five fast-moving editions turn Africa’s languages, histories, proverbs, foodways, music and visual cultures into a knowledge quest built for curiosity.</p>
            <div className="guardrails"><div><b>Africa is plural</b><span>Each answer opens a door, never claims to contain a whole people or place.</span></div><div><b>Your portrait is private</b><span>Photos are processed in your browser and are never uploaded or stored.</span></div><div><b>Learn as you play</b><span>Every answer unlocks a clear explanation—correct guess or not.</span></div><div><b>An original score</b><span>The reactive audio is an abstract game soundtrack, not a traditional recording.</span></div></div>
            <p className="source-label">Follow the knowledge trail</p>
            <div className="source-links">
              {sourceCollections.map((source) => <a key={source.href} href={source.href} target="_blank" rel="noreferrer">{source.label} ↗</a>)}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
