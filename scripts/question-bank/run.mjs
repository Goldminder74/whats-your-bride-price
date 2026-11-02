import { readFile, writeFile, mkdir } from "node:fs/promises";
import { classicBank } from "../../question-bank/classic.ts";
import { evaluateQuestion, passed } from "../../question-bank/gate.ts";
import { answerLeaks, normalizeText } from "../../question-bank/text.ts";

const root = new URL("../../data/question-bank/", import.meta.url);
const regions = ["west", "east", "central", "north", "south"];
const categoryMap = {
  ART: "FASHION",
  "ART & HISTORY": "HISTORY",
  FOOD: "FOOD",
  GEOGRAPHY: "GEOGRAPHY",
  HISTORY: "HISTORY",
  LANGUAGE: "LANGUAGE",
  "MODERN HISTORY": "HISTORY",
  MUSIC: "MUSIC",
  "ORAL HISTORY": "HISTORY",
  "PEOPLES & LANGUAGE": "LANGUAGE",
  PHILOSOPHY: "PROVERBS",
  PROVERBS: "PROVERBS",
  SYMBOLS: "HISTORY",
  TEXTILES: "FASHION",
  TRADITION: "FESTIVALS",
};
const difficultyMap = { introductory: "easy", intermediate: "medium", advanced: "hard", easy: "easy", medium: "medium", hard: "hard" };
const headers = {
  "user-agent": "WYBPQuestionBank/1.0 (educational culture quiz; contact team@classesforculture.com)",
  accept: "text/html,application/json",
};

function priorOf(question) {
  const correct = (question.correct || []).map((index) => normalizeText(question.options[index] || "")).join(" ");
  return { id: question.id, prompt: question.prompt, country: question.country, category: question.category, correctText: correct };
}

function fromDraft(raw, region) {
  const options = raw.answerOptions.map((option) => option.text);
  const idToIndex = new Map(raw.answerOptions.map((option, index) => [option.id, index]));
  const accepted = raw.acceptedAnswers?.[0] || [];
  const correct = accepted.map((id) => idToIndex.get(id)).filter((index) => index !== undefined);
  const source = raw.sources?.[0];
  return {
    id: raw.stableId,
    region,
    country: raw.countryScope || "",
    category: categoryMap[raw.category] || "HISTORY",
    difficulty: difficultyMap[raw.difficulty] || "medium",
    kind: raw.questionKind,
    prompt: raw.questionText,
    options,
    correct,
    explanation: raw.explanation,
    sources: source ? [{
      title: source.title,
      url: source.urlOrReference,
      claim: source.relevantClaim,
    }] : [],
    origin: "draft",
    sensitivityNotes: raw.sensitivityNotes,
  };
}

async function loadJson(url) {
  return JSON.parse(await readFile(url, "utf8"));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function usableText(value) {
  const text = value || "";
  if (text.length < 80) return false;
  if (/Jump to content|Main menu|does not support JavaScript/i.test(text.slice(0, 400))) return false;
  return true;
}

async function fetchText(url, cache) {
  if (cache[url] && cache[url].status === 404) return cache[url];
  if (cache[url] && cache[url].status === 200 && usableText(cache[url].text)) return cache[url];
  let status = 0;
  let text = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      if (url.includes("wikipedia.org/wiki/")) {
        const title = decodeURIComponent(url.split("/wiki/")[1] || "");
        const api = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&format=json&titles=${encodeURIComponent(title)}`;
        const summary = await fetch(api, { headers, redirect: "follow" });
        status = summary.status;
        if (status === 429) {
          await sleep(1200 * (attempt + 1));
          continue;
        }
        if (summary.ok) {
          const data = await summary.json();
          const pages = Object.values(data.query?.pages || {});
          const page = pages[0] || {};
          if (page.missing === undefined && page.extract) {
            text = `${page.title || ""} ${page.extract}`;
            status = 200;
          } else status = 404;
        }
      }
      if (!usableText(text)) {
        const title = decodeURIComponent(url.split("/wiki/")[1] || "");
        const summaryUrl = url.includes("wikipedia.org/wiki/")
          ? `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
          : url;
        const response = await fetch(summaryUrl, { headers, redirect: "follow" });
        status = response.status;
        if (status === 429) {
          await sleep(1200 * (attempt + 1));
          continue;
        }
        if (response.ok) {
          const body = await response.text();
          if (summaryUrl.includes("/page/summary/")) {
            const data = JSON.parse(body);
            text = `${data.title || ""} ${data.description || ""} ${data.extract || ""}`;
            if (data.title) status = 200;
          } else {
            text = body.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
          }
        }
      }
      if (usableText(text) || status === 404) break;
    } catch {
      status = 0;
      await sleep(500);
    }
  }
  if ((status === 200 && usableText(text)) || status === 404) cache[url] = { status, text: text.slice(0, 12000) };
  return cache[url] || { status, text: usableText(text) ? text.slice(0, 12000) : "" };
}

async function mapPool(items, limit, worker) {
  const out = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: limit }, run));
  return out;
}

const cacheUrl = new URL("source-cache.json", root);
let cache = {};
try { cache = await loadJson(cacheUrl); } catch { cache = {}; }

const generated = {};
const drafts = {};
for (const region of regions) {
  generated[region] = (await loadJson(new URL(`generated/${region}.json`, root))).questions;
  const draftFile = await loadJson(new URL(`drafts/${region}.json`, root));
  drafts[region] = draftFile.questions.map((question) => fromDraft(question, region));
}

const urls = [...new Set(regions.flatMap((region) => [...generated[region], ...drafts[region]].map((question) => question.sources?.[0]?.url).filter(Boolean)))];
for (const url of Object.keys(cache)) {
  if (cache[url]?.status === 404) continue;
  if (cache[url]?.status === 200 && usableText(cache[url].text)) continue;
  delete cache[url];
}
const missing = urls.filter((url) => !cache[url]);
console.log(`fetching ${missing.length} sources (${urls.length} unique)`);
await mapPool(missing, 2, async (url) => {
  await fetchText(url, cache);
  return url;
});
await mkdir(root, { recursive: true });
await writeFile(cacheUrl, JSON.stringify(cache));

function humanizePrompt(prompt) {
  return prompt
    .replace(/, according to UNESCO/gi, "")
    .replace(/ according to UNESCO/gi, "")
    .replace(/ in UNESCO['’]s account/gi, "")
    .replace(/ in UNESCO['’]s public description/gi, "")
    .replace(/ in UNESCO['’]s multinational inscription/gi, "")
    .replace(/UNESCO['’]s public description of /gi, "")
    .replace(/UNESCO['’]s description of /gi, "")
    .replace(/ described by UNESCO/gi, "")
    .replace(/ documented by UNESCO/gi, "")
    .replace(/does UNESCO locate /gi, "is ")
    .replace(/does UNESCO name in /gi, "are used in ")
    .replace(/does UNESCO identify as /gi, "is ")
    .replace(/does UNESCO highlight in /gi, "stand out in ")
    .replace(/\s+/g, " ")
    .replace(/\s+\?/g, "?")
    .replace(/\s+,/g, ",")
    .trim();
}

function tidyClue(raw) {
  let clue = raw.replace(/\[[^\]]*\]/g, " ").replace(/\([^)]*\)/g, " ").replace(/\band\/or\b/gi, "and");
  clue = clue.split(/[.!?]/)[0].split(":")[0].replace(/\s+/g, " ").trim().replace(/[,:;]\s*$/, "");
  const head = clue.split(",")[0].trim();
  if (head.split(/\s+/).length >= 6) clue = head;
  if (clue.length > 135) clue = clue.slice(0, 135).replace(/\s+\S*$/, "").replace(/[,:;]\s*$/, "");
  clue = clue.replace(/(?:\b(?:behalf|during|which|that|after|before|with|for|from|by|into|onto|and|or|in|of|the|a|an))+$/i, "").trim();
  clue = clue.replace(/[,:;]\s*$/, "").trim();
  return clue;
}

function voicePrompt(category, clue) {
  if (!clue || clue.split(/\s+/).length < 5) return null;
  if (!/^(?:a|an|the)\b/i.test(clue)) return null;
  if (/\d$/.test(clue) || /\b(?:most famous|best known|best-known)\b/i.test(clue)) return null;
  if (/^(?:a|an|the)\s+(?:developing|contained|central|declared|inscribed|extending|considered|known|used|played|held)\b/i.test(clue)) return null;
  if (/\b(?:accused|rape|raping|kill|murder|torture|beating|died|death|population of)\b/i.test(clue)) return null;
  if (/\ba and\b/i.test(clue) || /\b(?:in|of|from|for|at|by|with|and|the|a|an)$/i.test(clue)) return null;
  let text = clue.charAt(0).toLowerCase() + clue.slice(1);
  if (/^(?:born|live|chosen|accused)\b/i.test(text)) return null;
  let prompt;
  if (category === "GEOGRAPHY" && /\bcapital\b/i.test(text)) {
    const found = text.match(/\bcapital\b(?:(?!\bof\b).)*\bof\s+(.+)$/i);
    const place = (found?.[1] || "").replace(/\s+and\s+an\s+.+$/i, "").trim();
    if (place.length < 3) return null;
    prompt = `Which city is the capital of ${place}?`;
  } else if (category === "FOOD") prompt = `What do you call ${text}?`;
  else if (category === "PEOPLE" || category === "POP") {
    prompt = /\b(?:film|movie|drama|album|novel|book|song|series|thriller)\b/i.test(text) ? `What is ${text}?` : `Who is ${text}?`;
  }
  else if (category === "LANGUAGE") prompt = `Can you name ${text}?`;
  else if (category === "FESTIVALS") prompt = `Which celebration is ${text.replace(/^(?:a|an|the)\s+festival\b/i, "the celebration")}?`;
  else if (category === "WEDDINGS") prompt = `What do you call ${text}?`;
  else if (category === "GEOGRAPHY") prompt = `Where is ${text}?`;
  else if (category === "PROVERBS") prompt = `Which saying means ${text}?`;
  else if (category === "SPORT") {
    const person = /\b(?:footballer|player|runner|athlete|striker|sprinter|boxer|champion|swimmer)\b/i.test(text);
    const label = !person && /\b(?:club|team|cup|tournament|championship|nickname)\b/i.test(text);
    prompt = label ? `What is ${text}?` : `Who is ${text}?`;
  }
  else if (/\b(?:singer|rapper|bandleader|producer|musician|composer|guitarist|vocalist|dj)\b/i.test(text)) {
    if (/^a\s+/i.test(text)) text = `the ${text.slice(2)}`;
    prompt = `Who is ${text}?`;
  } else prompt = `What is ${text}?`;
  prompt = prompt.replace(/\s+/g, " ").replace(/\s+\?/g, "?");
  if (prompt.length < 28 || prompt.length > 190 || !prompt.endsWith("?")) return null;
  if (/\ba and\b/i.test(prompt) || /\b(?:in|of|from|for|at|by|with|and|the|a|an)\s*\?$/.test(prompt)) return null;
  return prompt;
}

function ledeRewrite(question, pageText) {
  if (!pageText || question.kind !== "single" || question.origin !== "generated") return null;
  const answer = question.options?.[question.correct?.[0]] || "";
  const answerNorm = normalizeText(answer);
  if (answerNorm.length < 3) return null;
  const pieces = pageText.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).slice(0, 6);
  for (const raw of pieces) {
    const sentence = raw.trim();
    if (sentence.length < 40 || sentence.length > 1100) continue;
    if (/may refer to|disambiguation|javascript|main menu|==|accused|rape|kill|murder|torture|beating/i.test(sentence)) continue;
    if (!normalizeText(sentence).includes(answerNorm)) continue;
    const match = sentence.match(/\b(?:is|was|are|were)\s+(.{20,220})/i);
    if (!match) continue;
    const clue = tidyClue(match[1]);
    if (!clue || normalizeText(clue).includes(answerNorm)) continue;
    const prompt = voicePrompt(question.category, clue);
    if (!prompt || answerLeaks(prompt, question.options, question.correct)) continue;
    let claim = sentence.replace(/\s+/g, " ").trim();
    if (claim.length > 360) claim = claim.slice(0, 360).replace(/\s+\S*$/, "");
    return { prompt, claim };
  }
  return null;
}

const summary = {};
for (const region of regions) {
  const prior = classicBank(region).map(priorOf);
  const published = [];
  const held = [];
  const reasons = {};
  const candidates = [...generated[region], ...drafts[region]].map((question) => (
    question.origin === "draft" ? { ...question, prompt: humanizePrompt(question.prompt) } : question
  ));
  for (const question of candidates) {
    const url = question.sources?.[0]?.url || "";
    const hit = cache[url] || { status: null, text: "" };
    const context = { region, httpStatus: hit.status ?? null, pageText: hit.text || "", prior };
    let chosen = question;
    let report = evaluateQuestion(chosen, context);
    const rewrite = ledeRewrite(question, hit.text || "");
    if (!passed(report) && rewrite) {
      const rewritten = {
        ...question,
        prompt: rewrite.prompt,
        sources: [{ ...question.sources[0], claim: rewrite.claim }],
      };
      const retry = evaluateQuestion(rewritten, context);
      if (passed(retry)) {
        chosen = rewritten;
        report = retry;
      }
    }
    const stored = { ...chosen, gateReport: report, lifecycleStatus: passed(report) ? "published" : "held" };
    if (passed(report)) {
      published.push(stored);
      prior.push(priorOf(stored));
    } else {
      held.push({ ...stored, holdReasons: report.reasons });
      for (const reason of report.reasons) reasons[reason] = (reasons[reason] || 0) + 1;
    }
  }
  published.sort((a, b) => a.id.localeCompare(b.id));
  await mkdir(new URL("published/", root), { recursive: true });
  await mkdir(new URL("held/", root), { recursive: true });
  const publishedBody = JSON.stringify({ region, questions: published }, null, 2) + "\n";
  await writeFile(new URL(`published/${region}.json`, root), publishedBody);
  await mkdir(new URL("../../public/question-bank/", import.meta.url), { recursive: true });
  await writeFile(new URL(`../../public/question-bank/${region}.json`, import.meta.url), publishedBody);
  await writeFile(new URL(`held/${region}.json`, root), JSON.stringify({ region, questions: held }, null, 2) + "\n");
  const byCategory = {};
  const byDifficulty = {};
  const byKind = {};
  for (const question of published) {
    byCategory[question.category] = (byCategory[question.category] || 0) + 1;
    byDifficulty[question.difficulty] = (byDifficulty[question.difficulty] || 0) + 1;
    byKind[question.kind] = (byKind[question.kind] || 0) + 1;
  }
  summary[region] = {
    published: published.length,
    held: held.length,
    generated: generated[region].length,
    drafts: drafts[region].length,
    byCategory,
    byDifficulty,
    byKind,
    holdReasons: reasons,
  };
  console.log(region, summary[region].published, "published", summary[region].held, "held");
}

await mkdir(new URL("reports/", root), { recursive: true });
await writeFile(new URL("reports/summary.json", root), JSON.stringify({ generatedAt: "2026-11-02", summary }, null, 2) + "\n");
const short = regions.some((region) => summary[region].published < 85);
if (short) {
  console.error("A region is below 85 published questions");
  process.exitCode = 2;
}
