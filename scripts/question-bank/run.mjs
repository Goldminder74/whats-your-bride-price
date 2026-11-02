import { readFile, writeFile, mkdir } from "node:fs/promises";
import { classicBank } from "../../question-bank/classic.ts";
import { evaluateQuestion, passed } from "../../question-bank/gate.ts";
import { normalizeText } from "../../question-bank/text.ts";

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

async function fetchText(url, cache) {
  if (cache[url] && [200, 404].includes(cache[url].status)) return cache[url];
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
      if (text.length < 80 || status < 200 || status >= 400) {
        const response = await fetch(url, { headers, redirect: "follow" });
        status = response.status;
        if (status === 429) {
          await sleep(1200 * (attempt + 1));
          continue;
        }
        if (response.ok) {
          const html = await response.text();
          const stripped = html
            .replace(/<script[\s\S]*?<\/script>/gi, " ")
            .replace(/<style[\s\S]*?<\/style>/gi, " ")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ");
          text = `${text} ${stripped.slice(0, 60000)}`;
        }
      }
      break;
    } catch {
      status = 0;
      await sleep(500);
    }
  }
  if (status === 200 || status === 404) cache[url] = { status, text: text.slice(0, 12000) };
  return cache[url] || { status, text: text.slice(0, 12000) };
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
  if (![200, 404].includes(cache[url]?.status)) delete cache[url];
}
const missing = urls.filter((url) => !cache[url]);
console.log(`fetching ${missing.length} sources (${urls.length} unique)`);
await mapPool(missing, 2, async (url) => {
  await fetchText(url, cache);
  return url;
});
await mkdir(root, { recursive: true });
await writeFile(cacheUrl, JSON.stringify(cache));

const summary = {};
for (const region of regions) {
  const prior = classicBank(region).map(priorOf);
  const published = [];
  const held = [];
  const reasons = {};
  const candidates = [...generated[region], ...drafts[region]];
  for (const question of candidates) {
    const url = question.sources?.[0]?.url || "";
    const hit = cache[url] || { status: null, text: "" };
    const report = evaluateQuestion(question, {
      region,
      httpStatus: hit.status ?? null,
      pageText: hit.text || "",
      prior,
    });
    const stored = { ...question, gateReport: report, lifecycleStatus: passed(report) ? "published" : "held" };
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
  await writeFile(new URL(`published/${region}.json`, root), JSON.stringify({ region, questions: published }, null, 2) + "\n");
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
const short = regions.some((region) => summary[region].published < 200);
if (short) {
  console.error("A region is below 200 published questions");
  process.exitCode = 2;
}
