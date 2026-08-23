"use client";

/* eslint-disable @next/next/no-img-element -- the game intentionally draws same-origin and device-local images to canvas */
/* eslint-disable react-hooks/set-state-in-effect -- URL hydration and result commits are deliberate lifecycle transitions */

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { clearAnonymousSession, getOrCreateAnonymousSession } from "./anonymousSession";
import { approvedAvatarRegistry, isApprovedAvatarId, resolveApprovedAvatar } from "./avatarRegistry";
import type { SafeguardReviewFixture, TrustedChallengeEntry } from "./challengeEntry";
import { publicDisplayNameFallback, validateDisplayName } from "./displayNames";
import { regionOrder as educationalRegionOrder, regions as educationalRegions, sourceCollections, type RegionKey } from "./gameData";
import { entryContextToQuery, parseEntryContext, type EntryContext } from "./entryContext";
import { entryDiagnosticsEnabled, readEntryDiagnostics, type EntryDiagnosticsSnapshot } from "./entryDiagnostics";
import { emitEntryEvent } from "./entryEvents";
import { reportAppError } from "./errors";
import { activeFeatureFlags } from "./featureFlags";
import { answersMatch, calculateResultTier, defaultSoundEnabled, getCelebrationPieceCount } from "./gameLogic";
import { createPublicAppUrl, resolveBrowserPublicAppOrigin } from "./publicAppOrigin";
import {
  PRODUCT_SAFEGUARD,
  RESULT_MEDIA_SAFEGUARD,
  RESULT_TIER_COPY,
  RESULT_TIER_GIFTS,
  RESULT_TIER_TITLES,
  SAFE_RESULT_SHARE_SUFFIX,
  SCORING_PRINCIPLES,
} from "./productSafeguards";
import { copyShareText } from "./shareSupport";
import { privatePhotoFriendlyMessage, privatePhotoLimits, sanitizePrivatePhoto } from "./privatePhoto";
import {
  clearQuizRecovery,
  createQuizInstanceId,
  questionImageAssets,
  readQuizRecovery,
  recoveryAnswerResults,
  safeRecoveryAttribution,
  writeQuizRecovery,
  type QuizRecoveryState,
} from "./quizRecovery";

type Screen = "entry" | "challenge" | "fast_setup" | "home" | "setup" | "quiz" | "reveal" | "result";
type Question = { prompt: string; options: string[] };

const q = (prompt: string, ...options: string[]): Question => ({ prompt, options });

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const legacyRegions: Record<RegionKey, {
  name: string; short: string; place: string; mark: string; hello: string;
  palette: string[]; drops: string[]; questions: Question[];
}> = {
  west: {
    name: "West Africa", short: "West", place: "From the Sahel to the Atlantic", mark: "✦", hello: "You’re entering a world of rhythm, wit & radiant hospitality.", palette: ["#bb3e22", "#f0a11a", "#2a160c"],
    drops: [
      "Timbuktu’s earthen architecture is a living record of scholarship, faith and Sahelian ingenuity.",
      "Across West Africa, oral historians and musicians have carried family and community memory across generations.",
      "Cloth, colour and dress can communicate occasion, belonging and personal expression, never a single fixed identity.",
    ],
    questions: [
      q("The family party starts at 2. When do you arrive?", "At 1:55, gift in hand", "At 2:30, respectfully relaxed", "When the music gets serious", "I’m helping the host set up"),
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
      "North Africa holds Amazigh, Arab, Nubian, Saharan, Mediterranean and many other identities. No single story contains it.",
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
      q("The weather gives four seasons in one day. You…", "Packed layers, obviously", "Adapt the plan calmly", "Laugh and continue", "Call it unforgettable"),
      q("Your group needs a decision. You…", "Summarise the facts", "Make sure quieter voices speak", "Offer the brave option", "Build enthusiasm around a shared plan"),
      q("A cousin brings up lobola at dinner. You…", "Listen with respect", "Ask how traditions are changing", "Keep the talk warm and nuanced", "Ask one more thoughtful question"),
      q("The choir finds a perfect harmony. Your role?", "Absorb the goosebumps", "Hold one reliable note", "Add the joyful high part", "Conduct from the audience"),
      q("Your hospitality signature is…", "Everything thoughtfully ready", "The guest’s favourite thing", "Relaxed, generous energy", "Nobody leaves without leftovers"),
      q("A new creative idea feels risky. You…", "Test it quietly", "Find skilled collaborators", "Give it a bold first try", "Launch it and build the movement"),
      q("Your celebration finale is…", "A heartfelt toast", "A group photograph", "The song everyone knows", "Sunrise with the last dancers"),
    ],
  },
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const legacyRegionOrder: RegionKey[] = ["west", "east", "central", "north", "south"];
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
const avatarChoices = approvedAvatarRegistry;
const stampNames: Record<RegionKey, string[]> = {
  west: ["Story Keeper", "Rhythm Caller", "Table Diplomat", "Golden Host"],
  east: ["Horizon Seeker", "Coffee Circle", "Coast Connector", "Open Sky"],
  central: ["Forest Pulse", "Rumba Spark", "River Memory", "Joy Amplifier"],
  north: ["Medina Eye", "Desert Star", "Tea Poet", "Courtyard Light"],
  south: ["Ubuntu Heart", "Amapiano Step", "Bold Horizon", "Community Fire"],
};
const tierTitles = RESULT_TIER_TITLES;
const tierCopy = RESULT_TIER_COPY;
const gifts = RESULT_TIER_GIFTS;
const resultCalls = ["YOUR JOURNEY", "THE ROOTS ARE", "SO CLOSE TO", "THE COUNCIL IS"];
const resultCallEmphasis = ["BEGINS.", "CALLING.", "MASTERY.", "IMPRESSED."];
const kindLabels = { single: "ONE ANSWER", multi: "SELECT THREE", complete: "COMPLETE THE SENTENCE", image: "IMAGE CHALLENGE" } as const;
const regionalIntervals: Record<RegionKey, number[]> = {
  west: [1, 1.25, 1.5],
  east: [1, 1.2, 1.6],
  central: [1, 1.333, 1.666],
  north: [1, 1.125, 1.5],
  south: [1, 1.25, 1.75],
};
const regionalRollAccents: Record<RegionKey, number[]> = {
  west: [1, .58, .82, .66, 1, .72],
  east: [1, .62, .74, 1, .58, .86],
  central: [1, .72, .54, .92, .66, 1],
  north: [1, .55, .78, .62, .9, .7],
  south: [1, .7, 1, .58, .82, .68],
};
const revealLines = [
  "A bright beginning is taking shape.",
  "The rhythm is building.",
  "Regional mastery is almost in reach.",
  "The whole celebration is waking up.",
];
function fillPercussionNoise(channel: Float32Array<ArrayBufferLike>): void {
  for (let i = 0; i < channel.length; i += 1) {
    channel[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / channel.length, 4);
  }
}

function scheduleDrumHit(
  context: AudioContext,
  at: number,
  pitch: number,
  intensity: number,
): void {
  const body = context.createOscillator();
  const bodyGain = context.createGain();
  body.type = "sine";
  body.frequency.setValueAtTime(pitch * 1.9, at);
  body.frequency.exponentialRampToValueAtTime(pitch, at + .13);
  bodyGain.gain.setValueAtTime(.0001, at);
  bodyGain.gain.exponentialRampToValueAtTime(.075 * intensity, at + .008);
  bodyGain.gain.exponentialRampToValueAtTime(.001, at + .24);
  body.connect(bodyGain).connect(context.destination);
  body.start(at);
  body.stop(at + .26);

  const skinBuffer = context.createBuffer(1, Math.round(context.sampleRate * .055), context.sampleRate);
  fillPercussionNoise(skinBuffer.getChannelData(0));
  const skin = context.createBufferSource();
  const skinGain = context.createGain();
  const skinFilter = context.createBiquadFilter();
  skin.buffer = skinBuffer;
  skinFilter.type = "bandpass";
  skinFilter.frequency.value = 720 + pitch * 2;
  skinFilter.Q.value = 1.2;
  skinGain.gain.setValueAtTime(.028 * intensity, at);
  skinGain.gain.exponentialRampToValueAtTime(.001, at + .07);
  skin.connect(skinFilter).connect(skinGain).connect(context.destination);
  skin.start(at);
}

type BridePriceGameProps = {
  initialEntryContext?: EntryContext;
  trustedChallenge?: TrustedChallengeEntry;
  safeguardReviewFixture?: SafeguardReviewFixture;
};

function fastInitialScreen(entry: EntryContext | undefined, challenge: TrustedChallengeEntry | undefined): Screen {
  if (challenge) return "challenge";
  if (entry?.challenge) return "entry";
  return entry?.edition ? "fast_setup" : "entry";
}

export default function BridePriceGame({ initialEntryContext, trustedChallenge: resolvedTrustedChallenge, safeguardReviewFixture }: BridePriceGameProps) {
  const trustedChallenge = resolvedTrustedChallenge?.validity === "valid" ? resolvedTrustedChallenge : undefined;
  const fastEntryEnabled = activeFeatureFlags.fast_entry;
  const [hydrated, setHydrated] = useState(false);
  const [entryContext, setEntryContext] = useState<EntryContext>(() => initialEntryContext || parseEntryContext(""));
  const [screen, setScreen] = useState<Screen>(() => safeguardReviewFixture?.screen || (fastEntryEnabled ? fastInitialScreen(initialEntryContext, trustedChallenge) : "home"));
  const [regionKey, setRegionKey] = useState<RegionKey>(() => trustedChallenge?.edition || initialEntryContext?.edition || "west");
  const [name, setName] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoNotice, setPhotoNotice] = useState("");
  const [photoNoticeKind, setPhotoNoticeKind] = useState<"neutral" | "success" | "error">("neutral");
  const [photoProcessing, setPhotoProcessing] = useState(false);
  const [localDataNotice, setLocalDataNotice] = useState("");
  const [avatarId, setAvatarId] = useState(trustedChallenge?.avatarId || avatarChoices[0].id);
  const [showAllAvatars, setShowAllAvatars] = useState(false);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>(() => safeguardReviewFixture?.screen === "result" ? Array(12).fill(safeguardReviewFixture.score === 12 ? 1 : 0) : []);
  const [answerChoices, setAnswerChoices] = useState<number[][]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [lastCorrect, setLastCorrect] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);
  const [sound, setSound] = useState(defaultSoundEnabled);
  const [menuOpen, setMenuOpen] = useState(false);
  const [bestScores, setBestScores] = useState<Partial<Record<RegionKey, number>>>({});
  const [allAfricaJustUnlocked, setAllAfricaJustUnlocked] = useState(false);
  const [revealAura, setRevealAura] = useState(0);
  const [entryMediaAttempt, setEntryMediaAttempt] = useState(0);
  const [entryMediaFailed, setEntryMediaFailed] = useState(false);
  const [entryTimings, setEntryTimings] = useState({ navigationMs: 0, shellVisibleMs: 0, interactiveMs: 0 });
  const [entryDiagnostics, setEntryDiagnostics] = useState<EntryDiagnosticsSnapshot | null>(null);
  const [shareNotice, setShareNotice] = useState("");
  const [failedQuestionImages, setFailedQuestionImages] = useState<Set<string>>(() => new Set());
  const [quizInstanceId, setQuizInstanceId] = useState<string | null>(null);
  const [recoveryNotice, setRecoveryNotice] = useState("");
  const [startLocked, setStartLocked] = useState(false);
  const [unverifiedChallenge, setUnverifiedChallenge] = useState(Boolean(initialEntryContext?.challenge && !trustedChallenge));
  const fileRef = useRef<HTMLInputElement>(null);
  const entryArtRef = useRef<HTMLImageElement>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const revealTimerRef = useRef<number | null>(null);
  const photoObjectUrlRef = useRef<string | null>(null);
  const photoBlobRef = useRef<Blob | null>(null);
  const photoAbortRef = useRef<AbortController | null>(null);
  const photoExpiryTimerRef = useRef<number | null>(null);
  const photoSelectionRef = useRef(0);
  const questionHeadingRef = useRef<HTMLHeadingElement>(null);
  const startLockRef = useRef(false);
  const region = regions[regionKey];
  const question = region.questions[index];
  const avatarChoice = resolveApprovedAvatar(avatarId);
  const avatar = avatarChoice.src;
  const displayNameValidation = useMemo(() => validateDisplayName(name), [name]);
  const privatePlayerName = displayNameValidation.valid ? displayNameValidation.value || "" : "";
  const portraitDisplayName = privatePlayerName || publicDisplayNameFallback;
  const displayNameError = displayNameValidation.valid ? "" : displayNameValidation.message;
  const portrait = photo || avatar;
  const correctCount = answers.reduce((sum, answer) => sum + answer, 0);
  const tier = calculateResultTier(correctCount);
  const aura = answers.reduce((sum, answer) => sum + (answer ? 150 : 45), 0);
  let streak = 0;
  for (let i = answers.length - 1; i >= 0 && answers[i] === 1; i -= 1) streak += 1;
  const stamps = Math.floor(answers.length / 3);
  const displayScores = screen === "result" ? { ...bestScores, [regionKey]: Math.max(bestScores[regionKey] || 0, correctCount) } : bestScores;
  const masteredRegions = regionOrder.filter((key) => (displayScores[key] || 0) > 8);
  const allAfricaUnlocked = masteredRegions.length === regionOrder.length;
  const celebrationPieceCount = getCelebrationPieceCount(tier);

  useEffect(() => {
    setHydrated(true);
    if (safeguardReviewFixture) return;
    if (fastEntryEnabled) {
      const parsedEntryContext = parseEntryContext(window.location.search, document.referrer);
      const challengeIsUnverified = Boolean(parsedEntryContext.challenge && !trustedChallenge);
      const safeEntryContext = challengeIsUnverified
        ? parseEntryContext(entryContextToQuery(parsedEntryContext, { edition: undefined, nominated: undefined, challenge: undefined }))
        : parsedEntryContext;
      setUnverifiedChallenge(challengeIsUnverified);
      setEntryContext(safeEntryContext);
      if (trustedChallenge) {
        setRegionKey(trustedChallenge.edition);
        setAvatarId(trustedChallenge.avatarId);
        setScreen("challenge");
        window.history.replaceState({ wybpScreen: "challenge" }, "", window.location.href);
      } else {
        const recovery = readQuizRecovery(window.localStorage, window.sessionStorage);
        if (recovery && parsedEntryContext.edition === recovery.edition && !challengeIsUnverified) {
          setRegionKey(recovery.edition);
          setAvatarId(recovery.avatarId);
          setAnswerChoices(recovery.answerChoices.map((choice) => [...choice]));
          setAnswers(recoveryAnswerResults(recovery));
          setIndex(Math.min(recovery.questionPosition, 11));
          setQuizInstanceId(recovery.instanceId);
          setRecoveryNotice("Your private, tab-scoped quiz was restored after refresh.");
          const restoredScreen = recovery.questionPosition === 12 ? "result" : "quiz";
          setScreen(restoredScreen);
          window.history.replaceState({ wybpScreen: restoredScreen }, "", window.location.href);
          emitEntryEvent({
            name: "quiz_resumed",
            source: recovery.attribution.source,
            edition: recovery.edition,
            nominated: recovery.attribution.nominated,
            hasChallenge: Boolean(recovery.trustedChallengeCode),
            hasInvalidContext: false,
            elapsedMs: performance.now(),
          });
        } else {
          if (safeEntryContext.edition) setRegionKey(safeEntryContext.edition);
          const initialScreen: Screen = safeEntryContext.edition ? "fast_setup" : "entry";
          setScreen(initialScreen);
          window.history.replaceState({ wybpScreen: initialScreen }, "", window.location.href);
        }
      }
      emitEntryEvent({
        name: "entry_view",
        source: parsedEntryContext.source,
        edition: parsedEntryContext.edition,
        nominated: parsedEntryContext.nominated === "1",
        hasChallenge: Boolean(parsedEntryContext.challenge),
        hasInvalidContext: parsedEntryContext.invalidFields.length > 0,
        elapsedMs: performance.now(),
      });
      if (parsedEntryContext.invalidFields.length > 0) emitEntryEvent({
        name: "entry_context_invalid",
        source: parsedEntryContext.source,
        edition: parsedEntryContext.edition,
        nominated: parsedEntryContext.nominated === "1",
        hasChallenge: Boolean(parsedEntryContext.challenge),
        hasInvalidContext: true,
        elapsedMs: performance.now(),
      });
    } else {
      const edition = new URLSearchParams(window.location.search).get("edition") as RegionKey | null;
      if (edition && regions[edition]) {
        setRegionKey(edition);
        setScreen("setup");
      }
    }
    try {
      const saved = JSON.parse(localStorage.getItem("wybp-region-scores") || "{}") as Partial<Record<RegionKey, number>>;
      setBestScores(Object.fromEntries(Object.entries(saved).filter(([key, value]) => regions[key as RegionKey] && typeof value === "number")) as Partial<Record<RegionKey, number>>);
    } catch { /* device progress is optional */ }
  }, [fastEntryEnabled, safeguardReviewFixture, trustedChallenge]);

  useEffect(() => {
    const session = getOrCreateAnonymousSession(window.sessionStorage);
    if (!session.available) return;
    const timer = window.setTimeout(() => {
      void getOrCreateAnonymousSession(window.sessionStorage);
    }, Math.max(1, session.expiresAt - Date.now() + 1));
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!fastEntryEnabled || !["entry", "challenge", "fast_setup"].includes(screen)) return;
    const shellVisibleMs = performance.now();
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    setEntryTimings((current) => ({ ...current, navigationMs: navigation?.responseStart || 0, shellVisibleMs }));
    emitEntryEvent({
      name: "entry_shell_visible",
      source: entryContext.source,
      edition: entryContext.edition,
      nominated: entryContext.nominated === "1",
      hasChallenge: Boolean(entryContext.challenge),
      hasInvalidContext: entryContext.invalidFields.length > 0,
      elapsedMs: shellVisibleMs,
      shellVisibleMs,
      firstMeaningfulChoiceReadyMs: shellVisibleMs,
      avatarChoiceReadyMs: screen === "fast_setup" ? shellVisibleMs : undefined,
    });
    const frame = window.requestAnimationFrame(() => {
      const interactiveMs = performance.now();
      setEntryTimings((current) => ({ ...current, interactiveMs }));
      emitEntryEvent({
        name: "entry_interactive",
        source: entryContext.source,
        edition: entryContext.edition,
        nominated: entryContext.nominated === "1",
        hasChallenge: Boolean(entryContext.challenge),
        hasInvalidContext: entryContext.invalidFields.length > 0,
        elapsedMs: interactiveMs,
        shellVisibleMs,
        firstMeaningfulChoiceReadyMs: interactiveMs,
        avatarChoiceReadyMs: screen === "fast_setup" ? interactiveMs : undefined,
      });
      if (entryDiagnosticsEnabled) setEntryDiagnostics(readEntryDiagnostics());
    });
    return () => window.cancelAnimationFrame(frame);
  }, [entryContext, fastEntryEnabled, screen]);

  useEffect(() => {
    setEntryMediaAttempt(0);
    setEntryMediaFailed(false);
  }, [regionKey]);

  useEffect(() => {
    if (!fastEntryEnabled || screen !== "entry" || !entryContext.edition) return;
    const verifyMedia = window.setTimeout(() => {
      const image = entryArtRef.current;
      if (image?.complete && image.naturalWidth === 0) setEntryMediaFailed(true);
    }, 0);
    return () => window.clearTimeout(verifyMedia);
  }, [entryContext.edition, entryMediaAttempt, fastEntryEnabled, screen]);

  useEffect(() => {
    if (!fastEntryEnabled || !["fast_setup", "quiz"].includes(screen)) return;
    const assets = questionImageAssets(regionKey, [0, 1]);
    const links = assets.map((href) => {
      const link = document.createElement("link");
      link.rel = "prefetch";
      link.as = "image";
      link.href = href;
      link.dataset.wybpQuestionPrefetch = "true";
      document.head.appendChild(link);
      return link;
    });
    return () => links.forEach((link) => link.remove());
  }, [fastEntryEnabled, regionKey, screen]);

  useEffect(() => {
    if (screen !== "quiz") return;
    const frame = window.requestAnimationFrame(() => questionHeadingRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [index, screen]);

  useEffect(() => {
    if (!fastEntryEnabled || !quizInstanceId || !["quiz", "reveal", "result"].includes(screen)) return;
    const state: QuizRecoveryState = {
      version: 1,
      instanceId: quizInstanceId,
      edition: regionKey,
      avatarId,
      questionPosition: answerChoices.length,
      answerChoices,
      updatedAt: Date.now(),
      attribution: safeRecoveryAttribution(entryContext),
      trustedChallengeCode: trustedChallenge?.code,
    };
    writeQuizRecovery(window.localStorage, window.sessionStorage, state);
  }, [answerChoices, avatarId, entryContext, fastEntryEnabled, quizInstanceId, regionKey, screen, trustedChallenge?.code]);

  useEffect(() => {
    if (!fastEntryEnabled) return;
    const restoreEntryScreen = (event: PopStateEvent) => {
      const parsedEntryContext = parseEntryContext(window.location.search, document.referrer);
      setEntryContext(parsedEntryContext);
      if (parsedEntryContext.edition) setRegionKey(parsedEntryContext.edition);
      const state = event.state as { wybpScreen?: string } | null;
      setScreen(state?.wybpScreen === "fast_setup" && parsedEntryContext.edition ? "fast_setup" : "entry");
      window.scrollTo(0, 0);
    };
    window.addEventListener("popstate", restoreEntryScreen);
    return () => window.removeEventListener("popstate", restoreEntryScreen);
  }, [fastEntryEnabled]);

  useEffect(() => () => {
    if (revealTimerRef.current !== null) window.clearTimeout(revealTimerRef.current);
    photoSelectionRef.current += 1;
    photoAbortRef.current?.abort();
    photoAbortRef.current = null;
    if (photoExpiryTimerRef.current !== null) window.clearTimeout(photoExpiryTimerRef.current);
    photoExpiryTimerRef.current = null;
    if (photoObjectUrlRef.current) URL.revokeObjectURL(photoObjectUrlRef.current);
    photoObjectUrlRef.current = null;
    photoBlobRef.current = null;
  }, []);

  useEffect(() => {
    if (screen !== "result") return;
    const beforeMastered = regionOrder.filter((key) => (bestScores[key] || 0) > 8).length;
    const next = { ...bestScores, [regionKey]: Math.max(bestScores[regionKey] || 0, correctCount) };
    const afterMastered = regionOrder.filter((key) => (next[key] || 0) > 8).length;
    setBestScores(next);
    if (beforeMastered < 5 && afterMastered === 5) setAllAfricaJustUnlocked(true);
    try { localStorage.setItem("wybp-region-scores", JSON.stringify(next)); } catch { /* device progress is optional */ }
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
        fillPercussionNoise(channel);
        const noise = context.createBufferSource(); const noiseGain = context.createGain();
        noise.buffer = buffer; noiseGain.gain.value = .04; noise.connect(noiseGain).connect(context.destination); noise.start();
      }
      navigator.vibrate?.(flourish ? [18, 35, 22] : 12);
    } catch { /* sound is an optional flourish */ }
  };

  const playResultDrumRoll = (scoreTier: number): number => {
    const silentDurations = [1000, 1250, 1550, 1950];
    if (!sound) return silentDurations[scoreTier];
    try {
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return silentDurations[scoreTier];
      const context = audioRef.current || new AudioContextClass();
      audioRef.current = context;
      if (context.state === "suspended") void context.resume();

      const hitCounts = [6, 9, 13, 19];
      const accents = regionalRollAccents[regionKey];
      const start = context.currentTime + .05;
      let cursor = start;
      for (let hit = 0; hit < hitCounts[scoreTier]; hit += 1) {
        const progress = hit / Math.max(1, hitCounts[scoreTier] - 1);
        const intensity = (.62 + scoreTier * .07) * accents[hit % accents.length];
        const pitch = 78 + (hit % 3) * 18 + scoreTier * 5;
        scheduleDrumHit(context, cursor, pitch, intensity);
        cursor += .22 - progress * (.08 + scoreTier * .015);
      }

      const finale = cursor + .08;
      regionalIntervals[regionKey].slice(0, scoreTier + 1).forEach((interval, noteIndex) => {
        scheduleDrumHit(context, finale + noteIndex * .075, 92 * interval, .9 + scoreTier * .06);
      });
      if (scoreTier === 3) {
        [0, .11, .22, .36].forEach((offset, index) => scheduleDrumHit(context, finale + offset, 116 + index * 14, 1));
      }
      navigator.vibrate?.(scoreTier === 3 ? [35, 35, 45, 35, 70] : [24, 35, 38]);
      return Math.ceil((finale - context.currentTime + .72 + scoreTier * .08) * 1000);
    } catch (error) {
      reportAppError("audio_failed", error, { action: "result_reveal", region: regionKey });
      return silentDurations[scoreTier];
    }
  };

  const clearPhoto = (notice = "", noticeKind: "neutral" | "error" = "neutral") => {
    photoSelectionRef.current += 1;
    photoAbortRef.current?.abort();
    photoAbortRef.current = null;
    if (photoExpiryTimerRef.current !== null) window.clearTimeout(photoExpiryTimerRef.current);
    photoExpiryTimerRef.current = null;
    if (photoObjectUrlRef.current) URL.revokeObjectURL(photoObjectUrlRef.current);
    photoObjectUrlRef.current = null;
    photoBlobRef.current = null;
    setPhoto(null);
    setPhotoProcessing(false);
    setPhotoNotice(notice);
    setPhotoNoticeKind(noticeKind);
    if (fileRef.current) fileRef.current.value = "";
  };

  const selectAvatar = (id: string) => {
    if (!isApprovedAvatarId(id)) return;
    clearPhoto();
    setAvatarId(id);
    if (fastEntryEnabled) emitEntryEvent({
      name: "avatar_selected",
      source: entryContext.source,
      edition: regionKey,
      nominated: entryContext.nominated === "1",
      hasChallenge: Boolean(trustedChallenge),
      hasInvalidContext: entryContext.invalidFields.length > 0,
    });
    playTone(470, true);
  };

  const chooseRegion = (key: RegionKey) => {
    setRegionKey(key);
    setScreen(fastEntryEnabled ? "fast_setup" : "setup");
    setAnswers([]);
    setAnswerChoices([]);
    setIndex(0);
    setSelected([]);
    setFeedbackOpen(false);
    setQuizInstanceId(null);
    setRecoveryNotice("");
    setStartLocked(false);
    startLockRef.current = false;
    if (fastEntryEnabled) {
      clearQuizRecovery(window.localStorage, window.sessionStorage);
      const nextContext = parseEntryContext(entryContextToQuery(entryContext, { edition: key }));
      setEntryContext(nextContext);
      const query = entryContextToQuery(nextContext).toString();
      window.history.pushState({ wybpScreen: "fast_setup" }, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
      emitEntryEvent({
        name: "edition_selected",
        source: nextContext.source,
        edition: key,
        nominated: nextContext.nominated === "1",
        hasChallenge: Boolean(trustedChallenge),
        hasInvalidContext: nextContext.invalidFields.length > 0,
      });
    } else {
      window.history.replaceState({}, "", `?edition=${key}`);
    }
    playTone(350 + regionOrder.indexOf(key) * 60, true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const acceptTrustedChallenge = () => {
    if (!trustedChallenge) return;
    setRegionKey(trustedChallenge.edition);
    setAvatarId(trustedChallenge.avatarId);
    const nextContext = parseEntryContext(entryContextToQuery(entryContext, { edition: trustedChallenge.edition }));
    setEntryContext(nextContext);
    setScreen("fast_setup");
    window.history.replaceState({ wybpScreen: "fast_setup" }, "", `?${entryContextToQuery(nextContext)}`);
    emitEntryEvent({
      name: "edition_selected",
      source: nextContext.source,
      edition: trustedChallenge.edition,
      nominated: true,
      hasChallenge: true,
      hasInvalidContext: false,
    });
    window.scrollTo(0, 0);
  };

  const onPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = event.target.files?.[0];
    if (!file) return;
    clearPhoto();
    const selection = photoSelectionRef.current;
    const controller = new AbortController();
    photoAbortRef.current = controller;
    setPhotoProcessing(true);
    setPhotoNoticeKind("neutral");
    setPhotoNotice("Processing your photo privately on this device…");
    try {
      const sanitized = await sanitizePrivatePhoto(file, { signal: controller.signal });
      if (selection !== photoSelectionRef.current || controller.signal.aborted) return;
      const sanitizedUrl = URL.createObjectURL(sanitized.blob);
      photoBlobRef.current = sanitized.blob;
      photoObjectUrlRef.current = sanitizedUrl;
      setPhoto(sanitizedUrl);
      setPhotoNoticeKind("success");
      setPhotoNotice("Sanitised photo ready. The original was not uploaded, and metadata was removed from this on-device copy.");
      photoExpiryTimerRef.current = window.setTimeout(() => {
        clearPhoto("Your private photo expired from memory. Your avatar is ready instead.");
      }, privatePhotoLimits.lifetimeMs);
    } catch (error) {
      if (selection === photoSelectionRef.current) {
        setPhotoNoticeKind("error");
        setPhotoNotice(privatePhotoFriendlyMessage(error));
        if (!(error instanceof DOMException && error.name === "AbortError")) reportAppError("photo_read_failed", error, { action: "private_photo_sanitize" });
      }
    } finally {
      if (selection === photoSelectionRef.current) {
        setPhotoProcessing(false);
        photoAbortRef.current = null;
        input.value = "";
      }
    }
  };

  const beginQuiz = () => {
    if (startLockRef.current) return;
    if (!displayNameValidation.valid) {
      document.querySelector<HTMLInputElement>("[data-display-name]")?.focus();
      return;
    }
    if (displayNameValidation.value !== null && name !== displayNameValidation.value) setName(displayNameValidation.value);
    startLockRef.current = true;
    setStartLocked(true);
    if (fastEntryEnabled && answerChoices.length > 0 && quizInstanceId) {
      setIndex(Math.min(answerChoices.length, 11));
    } else {
      setIndex(0); setAnswers([]); setAnswerChoices([]);
      if (fastEntryEnabled) setQuizInstanceId(createQuizInstanceId());
    }
    setSelected([]); setFeedbackOpen(false); setScreen("quiz");
    if (fastEntryEnabled) {
      if (!photo) emitEntryEvent({
        name: "photo_skipped",
        source: entryContext.source,
        edition: regionKey,
        nominated: entryContext.nominated === "1",
        hasChallenge: Boolean(trustedChallenge),
        hasInvalidContext: entryContext.invalidFields.length > 0,
      });
      emitEntryEvent({
        name: "quiz_started",
        source: entryContext.source,
        edition: regionKey,
        nominated: entryContext.nominated === "1",
        hasChallenge: Boolean(trustedChallenge),
        hasInvalidContext: entryContext.invalidFields.length > 0,
      });
    }
    playTone(520, true); window.scrollTo(0, 0);
  };

  const submitAnswer = (choice: number[]) => {
    if (feedbackOpen) return;
    const expected = region.questions[index].correct;
    const isCorrect = answersMatch(choice, expected);
    setSelected(choice); setLastCorrect(isCorrect); setAnswers((current) => [...current, isCorrect ? 1 : 0]); setAnswerChoices((current) => [...current, [...choice]]); setFeedbackOpen(true);
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
      setScreen("reveal");
      setDropOpen(false);
      const revealDuration = playResultDrumRoll(tier);
      revealTimerRef.current = window.setTimeout(() => {
        revealTimerRef.current = null;
        setScreen("result");
      }, revealDuration);
    } else {
      setIndex((current) => current + 1); setSelected([]); setFeedbackOpen(false);
      if ((index + 1) % 3 === 0) setDropOpen(true);
    }
  };

  const restart = () => {
    if (revealTimerRef.current !== null) {
      window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    if (fastEntryEnabled) {
      emitEntryEvent({
        name: "quiz_restarted",
        source: entryContext.source,
        edition: regionKey,
        nominated: entryContext.nominated === "1",
        hasChallenge: Boolean(trustedChallenge),
        hasInvalidContext: entryContext.invalidFields.length > 0,
      });
      clearQuizRecovery(window.localStorage, window.sessionStorage);
    }
    clearPhoto();
    setScreen(fastEntryEnabled ? "entry" : "home"); setAnswers([]); setAnswerChoices([]); setIndex(0); setSelected([]); setFeedbackOpen(false); setAllAfricaJustUnlocked(false);
    setQuizInstanceId(null); setRecoveryNotice(""); setName(""); setAvatarId(avatarChoices[0].id); setShowAllAvatars(false); setStartLocked(false); startLockRef.current = false;
    if (fastEntryEnabled) { setEntryContext(parseEntryContext("")); setUnverifiedChallenge(false); }
    window.history.replaceState({}, "", window.location.pathname); window.scrollTo(0, 0);
  };

  const clearLocalQuizData = () => {
    clearPhoto();
    clearQuizRecovery(window.localStorage, window.sessionStorage);
    clearAnonymousSession(window.sessionStorage);
    try { window.localStorage.removeItem("wybp-region-scores"); } catch { /* local continuity is optional */ }
    setBestScores({});
    setQuizInstanceId(null);
    setRecoveryNotice("");
    setLocalDataNotice("Local quiz recovery, mastery scores and this tab’s anonymous session have been cleared.");
  };

  const leaveSetup = () => {
    if (!fastEntryEnabled) {
      setScreen("home");
      return;
    }
    const state = window.history.state as { wybpScreen?: string } | null;
    if (state?.wybpScreen === "fast_setup" && window.history.length > 1) window.history.back();
    else {
      const genericContext = parseEntryContext(entryContextToQuery(entryContext, { edition: undefined, nominated: undefined, challenge: undefined }));
      setEntryContext(genericContext);
      setScreen("entry");
      window.history.replaceState({ wybpScreen: "entry" }, "", `${window.location.pathname}?${entryContextToQuery(genericContext)}`);
    }
  };

  const changeAvatarDuringQuiz = () => {
    startLockRef.current = false;
    setStartLocked(false);
    setScreen(fastEntryEnabled ? "fast_setup" : "setup");
    window.scrollTo(0, 0);
  };

  const nominationUrls = useMemo(() => {
    if (typeof window === "undefined") return "";
    const sharedContext = {
      edition: regionKey,
      nominated: "1" as const,
      challenge: entryContext.challenge,
      utm_source: entryContext.utm_source,
      utm_medium: entryContext.utm_medium,
      utm_campaign: entryContext.utm_campaign,
      ref: entryContext.ref,
    };
    const origin = resolveBrowserPublicAppOrigin(window.location.origin);
    return {
      native: createPublicAppUrl(window.location.pathname, { ...sharedContext, source: "native" }, origin),
      whatsapp: createPublicAppUrl(window.location.pathname, { ...sharedContext, source: "whatsapp" }, origin),
    };
  }, [entryContext.challenge, entryContext.ref, entryContext.utm_campaign, entryContext.utm_medium, entryContext.utm_source, regionKey]);
  const nominationUrl = typeof nominationUrls === "string" ? "" : nominationUrls.native;
  const whatsappNominationUrl = typeof nominationUrls === "string" ? "" : nominationUrls.whatsapp;

  const nominate = async () => {
    setShareNotice("");
    const text = `${privatePlayerName || "I"} just played the ${region.name} edition of What’s Your Bride Price? I nominate you next. ${SAFE_RESULT_SHARE_SUFFIX}`;
    if (navigator.share) {
      try { await navigator.share({ title: "You’ve been nominated!", text, url: nominationUrl }); return; } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) reportAppError("share_failed", error, { action: "nomination" });
        return;
      }
    }
    try {
      const copyResult = await copyShareText(navigator.clipboard, `${text} ${nominationUrl}`);
      if (copyResult !== "copied") throw new Error("Clipboard API unavailable");
      setShareNotice("Nomination link copied. Paste it into any conversation.");
    } catch (error) {
      reportAppError("share_failed", error, { action: "nomination_copy" });
      setShareNotice("Copying is unavailable here. Use the WhatsApp link or your browser’s share menu.");
    }
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
    ctx.fillStyle = "#f3e7cc"; ctx.font = "italic 46px Georgia"; ctx.fillText(portraitDisplayName, 540, 625);
    ctx.fillStyle = accent; ctx.font = "900 84px Impact, Arial Black"; ctx.fillText(tierTitles[tier].toUpperCase(), 540, 735);
    ctx.fillStyle = "#f3e7cc"; ctx.font = "36px Georgia";
    ctx.fillText(gifts[tier][0].toUpperCase(), 540, 845);
    ctx.font = "italic 29px Georgia"; ctx.fillText(`+${gifts[tier][1]} + ${gifts[tier][2]}`, 540, 907);
    ctx.fillStyle = accent; ctx.font = "700 25px Arial"; ctx.fillText(`KNOWLEDGE SCORE ${correctCount}/12 • ${region.name.toUpperCase()}`, 540, 1010);
    ctx.fillStyle = "#f3e7cc"; ctx.font = "900 58px Impact, Arial Black"; ctx.fillText("WHAT’S YOUR BRIDE PRICE?", 540, 1130);
    ctx.font = "24px Arial"; ctx.fillText("Play your region. Share your result. Nominate a friend.", 540, 1185);
    ctx.fillStyle = accent; ctx.font = "700 22px Arial";
    ctx.fillText(RESULT_MEDIA_SAFEGUARD.text, 540, RESULT_MEDIA_SAFEGUARD.baselineY);
    return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  };

  const downloadResult = async () => {
    try {
      const blob = await resultBlob(); if (!blob) return;
      const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `bride-price-${regionKey}-result.png`; anchor.click(); URL.revokeObjectURL(url);
    } catch (error) {
      reportAppError("result_export_failed", error, { action: "download", region: regionKey });
      alert("We could not prepare the portrait this time. Please try again.");
    }
  };

  const shareResult = async () => {
    try {
      const blob = await resultBlob();
      const file = blob ? new File([blob], "my-bride-price-result.png", { type: "image/png" }) : null;
      const shareData: ShareData = { title: "My Bride Price culture-game result", text: `I scored ${correctCount}/12 and unlocked ${tierTitles[tier]} in the ${region.name} edition. ${SAFE_RESULT_SHARE_SUFFIX}`, url: nominationUrl };
      if (file && navigator.canShare?.({ files: [file] })) shareData.files = [file];
      if (navigator.share) {
        try { await navigator.share(shareData); } catch (error) {
          if (!(error instanceof DOMException && error.name === "AbortError")) reportAppError("share_failed", error, { action: "result" });
        }
      }
      else await downloadResult();
    } catch (error) {
      reportAppError("result_export_failed", error, { action: "share", region: regionKey });
      alert("We could not prepare the portrait this time. Please try again.");
    }
  };

  return (
    <main className={`game-shell theme-${regionKey} screen-${screen}${safeguardReviewFixture?.reducedMotion ? " review-reduced-motion" : ""}`} data-hydrated={hydrated}>
      <div className="grain" aria-hidden="true" />
      <header className="topbar">
        <button className="wordmark wordmark-button" onClick={restart} aria-label="Return home">
          <span className="wordmark-seal">W</span>
          <span>WHAT’S YOUR<br /><strong>BRIDE PRICE?</strong></span>
        </button>
        <div className="nav-links">
          {screen === "home" && <a href="#editions">The editions</a>}
          {screen === "home" && <span className="passport-mini">Mastery seals <b>{masteredRegions.length}/5</b></span>}
          <button className="text-nav" onClick={() => setMenuOpen(true)}>About the game</button>
          <button className="sound-button" onClick={() => setSound(!sound)} aria-label={sound ? "Turn sound off" : "Turn sound on"}><span>{sound ? "♪" : "×"}</span> Sound {sound ? "on" : "off"}</button>
        </div>
      </header>

      {screen === "entry" && (
        <section className="fast-entry-shell" data-fast-entry-shell data-entry-source={entryContext.source}>
          <div className="fast-entry-copy">
            <p className="fast-entry-kicker">The Motherland is calling</p>
            {entryContext.edition && !unverifiedChallenge ? (
              <>
                <span className="fast-entry-mark" aria-hidden="true">{region.mark}</span>
                <p className="eyebrow">{region.place}</p>
                <h1>{entryContext.nominated ? "YOU’VE BEEN NOMINATED." : "YOUR REGION IS READY."}<br /><i>{region.name}</i></h1>
                <p>{entryContext.nominated ? "A friend has called you into the culture challenge. Bring your best roots knowledge." : region.hello}</p>
                {entryContext.challenge && <p className="fast-entry-context">Challenge link recognised. Your score will be earned in the game.</p>}
                <p className="entry-safeguard safeguard-decision" id="direct-entry-safeguard">{PRODUCT_SAFEGUARD}</p>
                <button className="big-action fast-entry-action" aria-describedby="direct-entry-safeguard" onClick={() => chooseRegion(entryContext.edition!)}>Enter {region.name} <span>▶</span></button>
              </>
            ) : (
              <>
                <span className="fast-entry-mark" aria-hidden="true">W</span>
                <p className="eyebrow">Five regions. Sixty culture questions.</p>
                <h1>CHOOSE YOUR<br /><i>AFRICAN REGION.</i></h1>
                <p>Go straight to the edition you know best, or choose one you want to discover.</p>
                <p className="entry-safeguard safeguard-decision" id="generic-entry-safeguard">{PRODUCT_SAFEGUARD}</p>
                <div className="fast-region-grid" aria-label="Choose your African region">
                  {regionOrder.map((key) => <button key={key} className={`region-choice-${key}`} data-entry-choice aria-describedby="generic-entry-safeguard" onClick={() => chooseRegion(key)}><span aria-hidden="true">{regions[key].mark}</span>{regions[key].name}</button>)}
                </div>
              </>
            )}
            {entryContext.invalidFields.length > 0 && <p className="entry-context-notice" role="status">Some link details were not recognised, so they were safely ignored.</p>}
            {unverifiedChallenge && <p className="entry-context-notice" role="status">That challenge could not be verified, so no inviter name or score was used. Choose any region to play safely.</p>}
          </div>
          {entryContext.edition && <div className={`fast-entry-art ${entryMediaFailed ? "media-failed" : ""}`}>
            {!entryMediaFailed && <img ref={entryArtRef} src={`/regions/${regionKey === "south" ? "southern" : regionKey}-africa.webp${entryMediaAttempt ? `?retry=${entryMediaAttempt}` : ""}`} alt={`${region.name} illustrated game world`} width="1200" height="800" fetchPriority="high" onLoad={() => setEntryMediaFailed(false)} onError={() => {
              setEntryMediaFailed(true);
            }} />}
            {entryMediaFailed && <div className="entry-media-fallback" role="status"><span aria-hidden="true">{region.mark}</span><p>The artwork is taking longer than expected. The game is still ready.</p><button onClick={() => {
              setEntryMediaFailed(false);
              setEntryMediaAttempt((attempt) => attempt + 1);
              emitEntryEvent({ name: "entry_retry", source: entryContext.source, edition: regionKey, nominated: entryContext.nominated === "1", hasChallenge: Boolean(entryContext.challenge), hasInvalidContext: entryContext.invalidFields.length > 0, elapsedMs: performance.now() });
            }}>Retry artwork</button></div>}
          </div>}
        </section>
      )}

      {screen === "challenge" && trustedChallenge && (
        <section className="trusted-challenge-stage" data-fast-entry-shell data-trusted-challenge data-entry-source={entryContext.source}>
          <div className="challenge-glow" aria-hidden="true" />
          <div className="trusted-challenge-card">
            <p className="fast-entry-kicker">A verified culture challenge</p>
            <div className="challenge-inviter">
              <img src={avatar} alt="" width="160" height="160" />
              <span>{trustedChallenge.inviterDisplayName} scored</span>
              <b>{trustedChallenge.verifiedScore}/{trustedChallenge.total}</b>
            </div>
            <p className="eyebrow">{region.name} edition</p>
            <h1>CAN YOU<br /><i>BEAT IT?</i></h1>
            <p>{trustedChallenge.inviterDisplayName} has invited you into {region.name}. Accept once, then choose your player and begin.</p>
            <p className="entry-safeguard safeguard-decision" id="trusted-challenge-safeguard">{PRODUCT_SAFEGUARD}</p>
            <button className="big-action fast-entry-action" aria-describedby="trusted-challenge-safeguard" onClick={acceptTrustedChallenge}>Accept the challenge <span>▶</span></button>
          </div>
          <div className="trusted-challenge-art"><img src={`/regions/${regionKey === "south" ? "southern" : regionKey}-africa.webp`} alt={`${region.name} illustrated game world`} width="1200" height="800" fetchPriority="high" /></div>
        </section>
      )}

      {screen === "fast_setup" && (
        <section className="fast-avatar-stage" data-fast-entry-shell data-fast-avatar data-entry-source={entryContext.source}>
          <div className="fast-avatar-world" aria-hidden="true"><img src={`/regions/${regionKey === "south" ? "southern" : regionKey}-africa.webp`} alt="" width="1200" height="800" fetchPriority="high" /></div>
          <button className="back-link" onClick={leaveSetup}>← All regions</button>
          <div className="fast-avatar-copy">
            <p className="eyebrow">{region.place}</p>
            <h1>CHOOSE YOUR<br /><i>PLAYER.</i></h1>
            <p>{region.name} is ready. Play anonymously with no account. Use an avatar, or optionally add a private photo processed only on this device.</p>
            <div className="setup-meta"><span>12 questions</span><span>About 3 minutes</span></div>
          </div>
          <div className="compact-player-card">
            <div className="compact-avatar-hero">
              <img src={portrait} alt="Your selected player portrait" width="256" height="256" />
              <div><span>{photo ? "Private photo" : avatarChoice.name}</span><b>{photo ? "Ready on this device" : avatarChoice.vibe}</b></div>
              <i aria-hidden="true">✓ SELECTED</i>
            </div>
            <p className="compact-duration">12 questions <span>•</span> About 3 minutes</p>
            <p className="entry-safeguard safeguard-decision compact-safeguard" id="avatar-entry-safeguard">{PRODUCT_SAFEGUARD}</p>
            <button className="big-action fast-quiz-start" aria-describedby="avatar-entry-safeguard" disabled={startLocked || photoProcessing} onClick={beginQuiz}>{photoProcessing ? "Processing photo…" : answerChoices.length > 0 ? `Continue at Question ${Math.min(answerChoices.length + 1, 12)}` : photo ? "Start Question 1" : "Continue without a photo"} <span>▶</span></button>
            <div className="compact-avatar-grid" aria-label="Choose an African avatar">
              {avatarChoices.slice(0, showAllAvatars ? avatarChoices.length : 6).map((item, avatarIndex) => {
                const active = !photo && avatarId === item.id;
                return <button key={item.id} className={active ? "active" : ""} aria-pressed={active} onClick={() => selectAvatar(item.id)} aria-label={`Choose ${item.name}, ${item.vibe}${active ? ", selected" : ""}`}>
                  <img src={item.src} alt="" width="128" height="128" loading={avatarIndex < 6 ? "eager" : "lazy"} decoding="async" />
                  <span>{item.name}</span>{active && <b>✓</b>}
                </button>;
              })}
            </div>
            <button className="show-avatar-action" onClick={() => setShowAllAvatars((current) => !current)}>{showAllAvatars ? "Show fewer avatars" : "See all 12 avatars"}</button>
            <div className="private-photo-actions">
              <button aria-describedby="avatar-entry-safeguard" disabled={photoProcessing} onClick={() => {
                emitEntryEvent({ name: "photo_picker_opened", source: entryContext.source, edition: regionKey, nominated: entryContext.nominated === "1", hasChallenge: Boolean(trustedChallenge), hasInvalidContext: false });
                fileRef.current?.click();
              }}>＋ {photo ? "Choose a different private photo" : "Choose a private photo"}</button>
              {(photo || photoProcessing) && <button onClick={() => clearPhoto("Photo removed. Your avatar is ready instead.")}>Remove my photo</button>}
            </div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={onPhoto} hidden />
            <p className="private-photo-explainer" id="private-photo-explainer">Optional. JPEG, PNG or WebP up to 8 MB. We re-encode the pixels on this device, remove source metadata and never upload the original. Your photo never affects scoring.</p>
            {photoNotice && <p className={`photo-status is-${photoProcessing ? "processing" : photoNoticeKind}`} data-photo-state={photoProcessing ? "processing" : photoNoticeKind} role="status" aria-live="polite">{photoNotice}</p>}
            <p className="recovery-explainer">No account is required. This tab can restore only your edition, avatar and answer choices for up to 24 hours. Names and photos are never saved.</p>
            <button className="start-again-control" onClick={restart}>Start again</button>
          </div>
        </section>
      )}

      {entryDiagnosticsEnabled && entryDiagnostics && fastEntryEnabled && (
        <aside className="entry-diagnostics" data-entry-diagnostics aria-label="Entry diagnostics">
          <b>Entry diagnostics</b>
          <span>Source: {entryContext.source}</span>
          <span>Edition: {entryContext.edition || "not selected"}</span>
          <span>Nominated: {entryContext.nominated === "1" ? "yes" : "no"}</span>
          <span>Challenge: {entryContext.challenge ? "valid shape" : "none"}</span>
          <span>Invalid fields: {entryContext.invalidFields.length}</span>
          <span>Reduced motion: {entryDiagnostics.reducedMotion ? "yes" : "no"}</span>
          <span>Web Share: {entryDiagnostics.webShare ? "available" : "unavailable"}</span>
          <span>Storage: {entryDiagnostics.storage}</span>
          <span>Connection: {entryDiagnostics.connection}</span>
          <span>Navigation: {Math.round(entryTimings.navigationMs)} ms</span>
          <span>Shell: {Math.round(entryTimings.shellVisibleMs)} ms</span>
          <span>Interactive: {Math.round(entryTimings.interactiveMs)} ms</span>
        </aside>
      )}

      {screen === "home" && (
        <>
          <section className="cinema-hero" id="top">
            <div className="cinema-glow" aria-hidden="true" />
            <div className="cinema-copy">
              <div className="live-pill"><i /> The Motherland is calling</div>
              <p className="cinema-kicker">A pan-African knowledge quest</p>
              <h1 className="challenge-headline"><span>DO YOU KNOW YOUR ROOTS?</span><em>THE MORE YOU KNOW, THE BRIGHTER YOUR SCORE</em><strong>LET’S PLAY!</strong></h1>
              <p>Pick a region you know best, or one you want to discover, because Africa is one vast and varied continent. Decode proverbs. Spot the dish. Trace an empire. Leave with a culture score, a regional portrait and facts worth sharing.</p>
              <p className="entry-safeguard safeguard-decision" id="home-entry-safeguard">{PRODUCT_SAFEGUARD}</p>
              <div className="cinema-actions">
                <button className="play-now" aria-describedby="home-entry-safeguard" onClick={() => setScreen("setup")}><span>▶</span> Start the challenge</button>
                <button className="trailer-button" onClick={() => setMenuOpen(true)}><span>ⓘ</span> What is this?</button>
              </div>
              <div className="hero-stats"><span><b>5</b> worlds</span><span><b>60</b> challenges</span><span><b>12</b> avatar heroes</span></div>
            </div>
            <div className="cinema-visual" aria-label="Five regional game worlds">
              {regionOrder.map((key, artIndex) => <button key={key} className={`world-poster world-${artIndex + 1}`} onClick={() => chooseRegion(key)}>
                <img src={`/regions/${key === "south" ? "southern" : key}-africa.webp`} alt={`${regions[key].name} illustrated game world`} />
                <span><small>World 0{artIndex + 1}</small>{regions[key].name}</span>
              </button>)}
              <div className="orbit-copy"><span>CHOOSE YOUR</span><b>AFRICAN</b><em>REGION</em></div>
            </div>
            <div className="game-marquee"><span>⚡ AVATAR LAB</span><span>✦ IMAGE ROUNDS</span><span>◉ CULTURE GEMS</span><span>♬ REACTIVE SOUND</span><span>↗ SHAREABLE REVEALS</span></div>
          </section>
          <section className="edition-section" id="editions">
            <div className="section-heading">
              <p>01 | Pick your path</p>
              <h2>FIVE REGIONS.<br /><i>ENDLESS</i> BRAGGING RIGHTS.</h2>
              <span>Every edition is its own world, with 12 questions inspired by the region’s rhythms, rituals and everyday magic.</span>
            </div>
            <div className="region-grid">
              {regionOrder.map((key, cardIndex) => {
                const item = regions[key];
                return <div className={`region-card ${key}`} key={key} role="button" tabIndex={0} data-region={key} onClick={() => chooseRegion(key)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); chooseRegion(key); } }} aria-label={`Play the ${item.name} edition`}>
                  <img className="region-art" src={`/regions/${key === "south" ? "southern" : key}-africa.webp`} alt="" />
                  <div className="card-pattern" aria-hidden="true" /><div className="card-number">0{cardIndex + 1}</div>
                  <div className="card-mark" aria-hidden="true">{item.mark}</div>
                  <div className="card-copy"><p>{item.place}</p><h3>{item.name}</h3>
                    <span className="region-enter">Enter Region <span>→</span></span>
                  </div>
                </div>;
              })}
            </div>
          </section>
          <section className="how-section">
            <p className="eyebrow">02 | How it works</p>
            <div className="how-intro"><h2>YOUR STORY.<br /><i>YOUR</i> SPOTLIGHT.</h2><p>Three joyful minutes to a portrait worth sharing.</p></div>
            <div className="steps">
              <div><b>01</b><span>Pick a region</span><p>Choose the edition you know, love or want to explore.</p></div>
              <div><b>02</b><span>Crack the culture</span><p>Images, proverbs, languages, history and select-three challenges.</p></div>
              <div><b>03</b><span>Learn + reveal</span><p>Get the story behind every answer, then claim your regional portrait.</p></div>
            </div>
          </section>
          <section className="values-strip">
            <p>{PRODUCT_SAFEGUARD}</p>
            <div><span>12</span> questions <i>•</i> <span>3</span> minutes <i>•</i> <span>1</span> unforgettable reveal</div>
          </section>
        </>
      )}

      {screen === "setup" && (
        <section className="setup-stage">
          <div className="regional-backdrop"><img src={`/regions/${regionKey === "south" ? "southern" : regionKey}-africa.webp`} alt="" width="1200" height="800" fetchPriority="high" /><span>{region.mark}</span></div>
          <button className="back-link" onClick={leaveSetup}>← All editions</button>
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
              <div><span>{photo ? "Custom icon" : avatarChoice.name}</span><b>{photo ? "One of one" : avatarChoice.vibe}</b></div>
              <i>READY</i>
            </div>
            <div className="avatar-grid" aria-label="Choose an African avatar">
              {avatarChoices.map((item) => <button key={item.id} className={!photo && avatarId === item.id ? "active" : ""} aria-pressed={!photo && avatarId === item.id} onClick={() => selectAvatar(item.id)} aria-label={`Choose ${item.name}, ${item.vibe}`}><img src={item.src} alt="" width="256" height="256" loading={fastEntryEnabled ? "lazy" : undefined} decoding="async" /><span>{item.name}</span></button>)}
            </div>
            <p className="entry-safeguard safeguard-decision setup-safeguard" id="setup-entry-safeguard">{PRODUCT_SAFEGUARD}</p>
            <button className="upload-own" aria-describedby="setup-entry-safeguard" disabled={photoProcessing} onClick={() => fileRef.current?.click()}><span>＋</span><b>{photo ? "Choose a different private photo" : "Optional: choose your own photo"}</b><small>Processed on this device. The original is never uploaded.</small></button>
            {(photo || photoProcessing) && <button className="remove-photo-action" onClick={() => clearPhoto("Photo removed. Your avatar is ready instead.")}>Remove my photo</button>}
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={onPhoto} hidden />
            <p className="private-photo-explainer" id="setup-photo-explainer">We accept JPEG, PNG or WebP up to 8 MB, re-encode the pixels on this device and remove source metadata. Photo choice never affects scoring.</p>
            {photoNotice && <p className={`photo-status is-${photoProcessing ? "processing" : photoNoticeKind}`} data-photo-state={photoProcessing ? "processing" : photoNoticeKind} role="status" aria-live="polite">{photoNotice}</p>}
            <label htmlFor="player-name">What should we call you?</label>
            <input id="player-name" data-display-name value={name} onChange={(event) => setName(event.target.value)} onBlur={() => { if (displayNameValidation.valid) setName(displayNameValidation.value || ""); }} aria-invalid={Boolean(displayNameError)} aria-describedby={displayNameError ? "setup-name-error" : undefined} placeholder="Name or pseudonym (optional)" />
            {displayNameError && <p className="display-name-error" id="setup-name-error" role="alert">{displayNameError}</p>}
            <button className="big-action" aria-describedby="setup-entry-safeguard" disabled={photoProcessing} onClick={beginQuiz}>{photoProcessing ? "Processing photo…" : `Enter Region 0${regionOrder.indexOf(regionKey) + 1}`} <span>▶</span></button>
          </div>
        </section>
      )}

      {screen === "quiz" && (
        <section className="quiz-stage">
          <div className="quiz-pattern" aria-hidden="true" />
          <div className="quiz-header">
            <button onClick={changeAvatarDuringQuiz}>← Change avatar</button>
            <div className="quiz-player"><img src={portrait} alt="" /><span>{privatePlayerName || avatarChoice.name}</span></div>
            <div className="game-hud">
              <span className="hud-edition">{region.name}</span>
              <span className="hud-aura"><i>✦</i><b>{aura}</b> aura</span>
              <span className="hud-streak"><i>⚡</i><b>{streak}</b> streak</span>
              <span className="hud-stamps"><i>◉</i><b>{stamps}</b>/4 gems</span>
              <b className="hud-round">{fastEntryEnabled ? `Question ${index + 1} of 12` : `${String(index + 1).padStart(2, "0")} / 12`}</b>
            </div>
          </div>
          {fastEntryEnabled && <div className="quiz-player-tools">
            <label htmlFor="quiz-player-name">Display name <span>(optional)</span></label>
            <input id="quiz-player-name" data-display-name value={name} onChange={(event) => setName(event.target.value)} onBlur={() => { if (displayNameValidation.valid) setName(displayNameValidation.value || ""); }} aria-invalid={Boolean(displayNameError)} aria-describedby={displayNameError ? "quiz-name-error" : undefined} placeholder="Add a name or pseudonym" />
            {displayNameError && <p className="display-name-error" id="quiz-name-error" role="alert">{displayNameError}</p>}
            <button onClick={restart}>Start again</button>
          </div>}
          {recoveryNotice && <p className="quiz-recovery-notice" role="status">{recoveryNotice}</p>}
          {fastEntryEnabled && <p className="sr-only" role="status" aria-live="polite">Question {index + 1} of 12</p>}
          <details className="scoring-details" open={safeguardReviewFixture?.screen === "quiz"}>
            <summary>How scoring works</summary>
            <div><p>{PRODUCT_SAFEGUARD}</p>{SCORING_PRINCIPLES.map((principle) => <p key={principle}>{principle}</p>)}</div>
          </details>
          <div className="progress-track" role="progressbar" aria-label="Quiz progress" aria-valuemin={1} aria-valuemax={12} aria-valuenow={index + 1}><span style={{ width: `${((index + 1) / 12) * 100}%` }} /></div>
          <div className="question-wrap" key={index}>
            <div className="question-meta"><p className="eyebrow">{kindLabels[question.kind]}</p><span>{question.topic}</span></div>
            <h2 ref={questionHeadingRef} tabIndex={-1} className={question.kind === "image" ? "image-question" : question.kind === "complete" ? "sentence-question" : ""}>{question.prompt}</h2>
            <div className={`answer-grid kind-${question.kind}`}>
              {question.options.map((option, optionIndex) => {
                const slot = (question.visualStart || 0) + optionIndex;
                const classes = [selected.includes(optionIndex) ? "selected" : "", feedbackOpen && question.correct.includes(optionIndex) ? "correct" : "", feedbackOpen && selected.includes(optionIndex) && !question.correct.includes(optionIndex) ? "wrong" : ""].filter(Boolean).join(" ");
                const imagePath = `/quiz-art/${regionKey}-${slot}.webp`;
                return <button key={option} className={classes} onClick={() => chooseAnswer(optionIndex)} disabled={feedbackOpen}>
                  {question.kind === "image" && !failedQuestionImages.has(imagePath) && <img className="answer-image" src={imagePath} alt={option} onError={() => setFailedQuestionImages((current) => new Set(current).add(imagePath))} />}
                  {question.kind === "image" && failedQuestionImages.has(imagePath) && <span className="question-image-fallback">Image unavailable. Use the answer text.</span>}
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

      {screen === "reveal" && (
        <section className={`score-reveal-stage reveal-tier-${tier}`} aria-live="assertive" aria-label="Your score is being revealed">
          <img className="score-reveal-world" src={`/regions/${regionKey === "south" ? "southern" : regionKey}-africa.webp`} alt="" />
          <div className="score-reveal-veil" aria-hidden="true" />
          <div className="reveal-bead-orbit" aria-hidden="true">
            {Array.from({ length: 12 + tier * 4 }, (_, beadIndex) => <i key={beadIndex} style={{ "--angle": `${(360 / (12 + tier * 4)) * beadIndex}deg` } as React.CSSProperties}>{beadIndex % 4 === 0 ? "◆" : "●"}</i>)}
          </div>
          <div className="reveal-drum">
            <span aria-hidden="true">{region.mark}</span>
            <img src={portrait} alt="Your player portrait" />
          </div>
          <p>{region.name} score ceremony</p>
          <h1>HOLD YOUR<br /><i>BREATH.</i></h1>
          <div className="drum-roll-meter" aria-hidden="true">{Array.from({ length: 7 + tier * 2 }, (_, pulse) => <i key={pulse} style={{ "--height": `${10 + (pulse % 5) * 6}px`, "--delay": `${pulse * -.04}s` } as React.CSSProperties} />)}</div>
          <b>{revealLines[tier]}</b>
          <p className="result-safeguard reveal-safeguard">{PRODUCT_SAFEGUARD}</p>
          <small>Knowledge. Rhythm. Reveal.</small>
        </section>
      )}

      {screen === "result" && (
        <section className={`result-stage celebration-tier-${tier}`}>
          <div className={`confetti confetti-tier-${tier}`} aria-hidden="true">{Array.from({ length: celebrationPieceCount }, (_, i) => <i key={i} style={{ "--i": i, "--x": `${(i * 43) % 100}%`, "--rotation": `${i * 27}deg`, "--duration": `${2.5 + (i % 5) * .3}s`, "--delay": `${(i % 7) * .08}s` } as React.CSSProperties}>{i % 9 === 0 ? "◌" : i % 5 === 0 ? region.mark : ""}</i>)}</div>
          {tier >= 2 && <div className="celebration-halo" aria-hidden="true">{Array.from({ length: 16 + tier * 4 }, (_, i) => <i key={i} style={{ "--angle": `${i * 15}deg`, "--delay": `${(i % 5) * .07}s` } as React.CSSProperties} />)}</div>}
          {allAfricaJustUnlocked && <div className="all-africa-coronation" role="dialog" aria-modal="true" aria-label="All Africa access unlocked">
            <div className="coronation-fire" aria-hidden="true">{Array.from({ length: 45 }, (_, i) => <i key={i} style={{ "--i": i } as React.CSSProperties} />)}</div>
            <div className="coronation-card"><span>✦ ◆ ◈ ✺ ☼</span><p>THE ULTIMATE PASSPORT</p><h2>ALL AFRICA<br /><i>ACCESS UNLOCKED</i></h2><b>Five regions mastered. Five scores of 9 or higher. One continent explored.</b><small>{privatePlayerName || "Champion"}, your Motherland Passport is complete. The council has declared your knowledge journey legendary.</small><small className="coronation-safeguard">{PRODUCT_SAFEGUARD}</small><button onClick={() => setAllAfricaJustUnlocked(false)}>Claim the crown ✦</button></div>
          </div>}
          <p className="result-kicker">{region.name} edition • playful cultural knowledge scorecard</p>
          <div className="result-layout">
            <div className="result-card">
              <img className="result-world-art" src={`/regions/${regionKey === "south" ? "southern" : regionKey}-africa.webp`} alt="" />
              <div className="result-frame">
                <div className="result-region">{region.mark} {region.short.toUpperCase()} AFRICA {region.mark}</div>
                <div className="result-portrait with-image"><img src={portrait} alt="" /></div>
                <p>{portraitDisplayName}</p>
                <h1>{tierTitles[tier]}</h1>
                <div className="result-gift"><b>{gifts[tier][0]}</b><span>+ {gifts[tier][1]}<br />+ {gifts[tier][2]}</span></div>
                <div className="result-gems">{stampNames[regionKey].map((stamp) => <i key={stamp} title={stamp}>◆</i>)}</div>
                <small>Knowledge score {correctCount}/12 • {region.short} Africa</small>
                <p className="result-card-safeguard">{PRODUCT_SAFEGUARD}</p>
              </div>
            </div>
            <div className="result-copy">
              <p className="eyebrow">Your score: {correctCount}/12</p><h2>{resultCalls[tier]}<br /><i>{resultCallEmphasis[tier]}</i></h2>
              <p className="result-description">{tierCopy[tier]}</p>
              <div className="result-aura"><span>Final aura</span><b>{revealAura.toLocaleString()}</b><i>+500 reveal bonus</i></div>
              <div className="worth-note knowledge-note"><span>✦</span><p><b>Your knowledge glow</b>You answered {correctCount} of 12 correctly and unlocked every explanation along the way.</p></div>
              {fastEntryEnabled && <div className="result-name-editor"><label htmlFor="result-player-name">Name or pseudonym on your portrait <span>(optional)</span></label><input id="result-player-name" data-display-name value={name} onChange={(event) => setName(event.target.value)} onBlur={() => { if (displayNameValidation.valid) setName(displayNameValidation.value || ""); }} aria-invalid={Boolean(displayNameError)} aria-describedby={displayNameError ? "result-name-error" : undefined} placeholder={publicDisplayNameFallback} />{displayNameError && <p className="display-name-error" id="result-name-error" role="alert">{displayNameError}</p>}</div>}
              {photo && <p className="private-media-boundary">Your private photo can appear only in the portrait you deliberately download or send through your device’s share sheet. Public links and previews use approved avatar and regional artwork.</p>}
              <div className="result-actions"><button className="big-action" onClick={shareResult}>Share my portrait <span>↗</span></button><button className="outline-action" onClick={downloadResult}>↓ Download</button></div>
              <button className="nominate-action" onClick={nominate}><span>＋</span><b>Nominate a friend</b><small>Sends them straight to the {region.short} edition</small><i>→</i></button>
              {shareNotice && <p className="share-notice" role="status">{shareNotice}</p>}
              <a className="whatsapp-link" href={`https://wa.me/?text=${encodeURIComponent(`I nominate you for the ${region.name} edition of What’s Your Bride Price? ${SAFE_RESULT_SHARE_SUFFIX} ${whatsappNominationUrl}`)}`}>Send nomination on WhatsApp ↗</a>
              <div className={`passport-progress ${allAfricaUnlocked ? "all-access" : ""}`}><span>{allAfricaUnlocked ? "ALL-AFRICA ACCESS UNLOCKED" : "Motherland passport locked"}</span><div>{regionOrder.map((key) => <i key={key} className={(displayScores[key] || 0) > 8 ? "earned" : ""} title={`${regions[key].name}: ${displayScores[key] || 0}/12`}><span>{regions[key].mark}</span><b>{displayScores[key] || 0}/12</b></i>)}</div><b>{allAfricaUnlocked ? "Five masteries complete • Ultimate passport earned" : `${masteredRegions.length}/5 mastery seals • score 9+ in every region to unlock`}</b></div>
              <button className="play-again" onClick={restart}>Play another edition</button>
            </div>
          </div>
        </section>
      )}

      {menuOpen && (
        <div className="about-modal" role="dialog" aria-modal="true" aria-label="About this game">
          <div className="about-sheet"><button className="modal-close" onClick={() => setMenuOpen(false)}>×</button>
            <p className="eyebrow">About this experience</p><h2>THE STAKES ARE HIGH<br /><i>PROVE YOUR CULTURE KNOWLEDGE</i></h2>
            <p className="about-safeguard">{PRODUCT_SAFEGUARD}</p>
            <p>This is a fictional entertainment and learning experience. Five fast-moving editions turn selected African languages, histories, proverbs, foodways, music and visual cultures into a knowledge quest built for curiosity. It does not value people or assess anyone’s suitability for marriage or relationships. Anonymous play needs no account.</p>
            <section className="about-scoring" aria-labelledby="about-scoring-title"><h3 id="about-scoring-title">How scoring works</h3>{SCORING_PRINCIPLES.map((principle) => <p key={principle}>{principle}</p>)}</section>
            <div className="guardrails"><div><b>Africa is plural</b><span>Each short question simplifies a diverse subject and opens a door. It never claims to contain a whole people, place or universal rule.</span></div><div><b>Your portrait is private</b><span>Photos are optional. The original is never uploaded. Its decoded pixels are resized and re-encoded on this device so source metadata is not copied. Remove my photo clears the in-memory copy. Names and photos are excluded from recovery, and neither changes scoring.</span></div><div><b>Limited recovery</b><span>This tab can restore edition, approved avatar and answer choices for up to 24 hours. It is non-authoritative and contains no name, photo or result score.</span></div><div><b>Learn as you play</b><span>Every answer unlocks a reviewed cultural explanation, correct guess or not.</span></div><div><b>An original score</b><span>The reactive audio is an abstract game soundtrack, not a traditional recording.</span></div></div>
            <p className="durable-storage-note"><b>Durable controls</b> Durable storage and public deletion controls are not active in this build. No D1 database or R2 media bucket is connected.</p>
            <button className="clear-local-data" onClick={clearLocalQuizData}>Clear local quiz data</button>
            {localDataNotice && <p className="local-data-notice" role="status">{localDataNotice}</p>}
            <p className="cultural-review-note"><b>Cultural review and reporting</b> Questions and explanations are based on the sources below, but any short quiz can miss nuance. Report cultural inaccuracies or insensitive wording through the Classes for Culture contact channel so the material can be reviewed.</p>
            <p className="audience-note"><b>Audience</b> Designed for adults and people who meet the applicable age of digital consent. It is not directed to children under 13. The game does not collect age or request proof of age.</p>
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
