import { readFile, writeFile } from "node:fs/promises";
import { classicBank } from "../../question-bank/classic.ts";
import { evaluateQuestion, passed } from "../../question-bank/gate.ts";
import { normalizeText } from "../../question-bank/text.ts";

const root = new URL("../../data/question-bank/", import.meta.url);
const regions = ["central", "north", "east", "south", "west"];
const headers = { "User-Agent": "WYBPQuestionBank/1.0 (educational culture quiz; contact team@classesforculture.com)" };
const cachePath = "/tmp/wybp-phase1-cache.json";
const writeMode = process.argv.includes("--write");

const SEEDS = {
  central: {
    city: ["Bangui", "Kinshasa", "Libreville", "Luanda", "Malabo", "N'Djamena", "Yaoundé"],
    land: ["Congo River", "Lake Chad", "Lake Kivu", "Virunga"],
    food: ["Achu", "Ndolé"],
    music: ["Congolese rumba", "Mvet", "Kizomba", "Kuduro"],
    person: ["Alain Mabanckou", "Ferdinand Oyono", "Patrice Lumumba", "Agostinho Neto"],
    sport: ["Samuel Eto'o", "Rigobert Song", "Joel Embiid", "Pascal Siakam"],
    lang: ["Lingala", "Sango", "Kikongo", "Ewondo"],
    fashion: ["Abacost", "La Sape", "Toghu"],
    history: ["Kuba kingdom"],
  },
  north: {
    city: ["Algiers", "Cairo", "Khartoum", "Rabat", "Marrakesh", "Nouakchott"],
    land: [],
    food: ["Couscous", "Tagine", "Harira", "Ful medames"],
    music: ["Umm Kulthum", "Oud", "Nass El Ghiwane", "Souad Massi"],
    person: ["Naguib Mahfouz", "Nawal El Saadawi", "Tahar Ben Jelloun", "Ibn Battuta"],
    sport: ["Achraf Hakimi", "Riyad Mahrez", "Ons Jabeur", "Yassine Bounou"],
    club: ["Al-Hilal", "Pharaohs"],
    lang: ["Egyptian Arabic", "Tamazight", "Sudanese Arabic", "Nubian"],
    history: ["Ancient Egypt", "Carthage", "Meroë", "Timgad"],
    festival: ["Imilchil Moussem", "Tan-Tan Moussem", "Sefrou cherry festival"],
  },
  east: {
    city: ["Nairobi", "Kampala", "Kigali", "Addis Ababa", "Dodoma", "Kigali"],
    land: ["Mount Kilimanjaro", "Serengeti", "Ngorongoro", "Zanzibar"],
    fashion: ["Kanzu", "Kofia", "Lamba"],
    sport: ["Abebe Bikila", "Derartu Tulu", "Eliud Kipchoge", "Haile Gebrselassie"],
    festival: [],
    food: ["Injera", "Ugali", "Nyama choma", "Pilau"],
  },
  south: {
    city: ["Gaborone", "Harare", "Lusaka", "Maputo", "Windhoek", "Lilongwe"],
    land: ["Namib", "Fish River Canyon", "Sossusvlei"],
    history: ["Thulamela", "Twyfelfontein", "Union Buildings"],
    fashion: ["Capulana", "Mokorotlo", "Kente cloth"],
    sport: ["Kagiso Rabada", "Wayde van Niekerk", "Caster Semenya", "Siya Kolisi"],
    person: ["Nadine Gordimer", "Nelson Mandela", "Tsitsi Dangarembga", "Trevor Noah"],
  },
  west: {
    history: ["Songhai Empire", "Nok culture"],
    festival: [],
    food: ["Jollof rice", "Fufu", "Suya", "Waakye"],
    pop: ["Wizkid", "Tiwa Savage", "Youssou N'Dour", "Angélique Kidjo"],
  },
};

function nested(left, right) {
  const a = normalizeText(left);
  const b = normalizeText(right);
  if (a.length < 4 || b.length < 4 || a === b) return false;
  return a.includes(b) || b.includes(a);
}

function yearish(option) {
  return /^\d{3,4}\b/.test(option.trim());
}

function blockedByQuote(option, quote) {
  const name = normalizeText(option);
  if (name.length < 5) return false;
  return normalizeText(quote).includes(name);
}

function pickDistractors(candidate, quote, names) {
  const chosen = [];
  const answer = candidate.answer;
  const capital = /\bcapital\b/i.test(candidate.prompt);
  for (const name of names) {
    if (!name || normalizeText(name) === normalizeText(answer)) continue;
    if (chosen.some((option) => normalizeText(option) === normalizeText(name))) continue;
    if (nested(name, answer) || chosen.some((option) => nested(name, option))) continue;
    if (blockedByQuote(name, quote)) continue;
    if (capital && /\b(?:river|lake|mount|mountain|falls|delta|desert)\b/i.test(name)) continue;
    if (chosen.some((option) => yearish(option) !== yearish(name))) continue;
    if (yearish(answer) !== yearish(name)) continue;
    chosen.push(name);
    if (chosen.length === 3) break;
  }
  return chosen;
}

async function loadCache() {
  try {
    return JSON.parse(await readFile(cachePath, "utf8"));
  } catch {
    return {};
  }
}

async function fetchPage(title, cache) {
  const key = title.toLowerCase();
  if (cache[key] && cache[key].status === 200 && (cache[key].text || "").length > 80) return cache[key];
  const api = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&exintro=1&redirects=1&format=json&titles=${encodeURIComponent(title)}`;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch(api, { headers, redirect: "follow" });
    if (response.status === 429) {
      await new Promise((resolve) => setTimeout(resolve, 1200 * (attempt + 1)));
      continue;
    }
    if (!response.ok) return { status: response.status, text: "", resolved: title };
    const data = await response.json();
    const page = Object.values(data.query?.pages || {})[0] || {};
    if (page.missing !== undefined || !page.extract) return { status: 404, text: "", resolved: title };
    const text = `${page.title || title} ${page.extract}`.replace(/\bc\.\s+/g, "circa ").replace(/\s+/g, " ").trim();
    const hit = { status: 200, text: text.slice(0, 12000), resolved: page.title || title };
    cache[key] = hit;
    return hit;
  }
  return { status: 429, text: "", resolved: title };
}

function wikiUrl(title) {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

function priorOf(question) {
  const correctText = question.correct.map((index) => normalizeText(question.options[index] || "")).join(" ");
  return { id: question.id, prompt: question.prompt, country: question.country, category: question.category, correctText };
}

async function main() {
  const candidates = JSON.parse(await readFile(new URL("./phase1-candidates.json", import.meta.url), "utf8"));
  const published = {};
  const answers = {};
  const priors = {};
  for (const region of regions) {
    const file = JSON.parse(await readFile(new URL(`published/${region}.json`, root), "utf8"));
    published[region] = file;
    answers[region] = new Set();
    priors[region] = [];
    for (const question of file.questions) {
      priors[region].push(priorOf(question));
      for (const index of question.correct) answers[region].add(normalizeText(question.options[index] || ""));
    }
    for (const question of classicBank(region)) priors[region].push(priorOf(question));
  }
  const cache = await loadCache();
  const accepted = [];
  const failed = [];
  const poolAnswers = {};
  for (const candidate of candidates) {
    const key = `${candidate.region}:${candidate.pool}`;
    poolAnswers[key] = poolAnswers[key] || [];
    poolAnswers[key].push(candidate.answer);
  }

  for (const candidate of candidates) {
    if (answers[candidate.region].has(normalizeText(candidate.answer))) {
      failed.push({ id: candidate.id, reasons: ["duplicate_answer_existing"] });
      continue;
    }
    if (candidate.prompt.length < 28 || candidate.prompt.length > 200 || !candidate.prompt.endsWith("?")) {
      failed.push({ id: candidate.id, reasons: ["prompt_shape"], prompt: candidate.prompt });
      continue;
    }
    if (candidate.explanation.length < 20 || /\u2014|\u2013/.test(`${candidate.prompt} ${candidate.explanation}`)) {
      failed.push({ id: candidate.id, reasons: ["explanation_shape"] });
      continue;
    }
    const page = await fetchPage(candidate.wiki, cache);
    if (page.status !== 200) {
      failed.push({ id: candidate.id, reasons: [`http_${page.status}`] });
      continue;
    }
    const names = [
      ...(poolAnswers[`${candidate.region}:${candidate.pool}`] || []),
      ...(SEEDS[candidate.region]?.[candidate.pool] || []),
    ];
    const probe = {
      ...blankQuestion(candidate, [candidate.answer, "Alpha", "Beta", "Gamma"]),
      sources: [{ title: page.resolved, url: wikiUrl(page.resolved), claim: "", method: "page-overlap" }],
    };
    const probed = evaluateQuestion(probe, {
      region: candidate.region,
      httpStatus: 200,
      pageText: page.text,
      prior: [],
    });
    const quote = probed.evidenceQuote;
    if (!quote) {
      failed.push({ id: candidate.id, reasons: probed.reasons, lead: page.text.slice(0, 280) });
      continue;
    }
    const distractors = pickDistractors(candidate, quote, names);
    if (distractors.length < 3) {
      failed.push({ id: candidate.id, reasons: ["distractors"], quote: quote.slice(0, 180) });
      continue;
    }
    const question = blankQuestion(candidate, [candidate.answer, ...distractors]);
    question.sources = [{ title: page.resolved, url: wikiUrl(page.resolved), claim: candidate.explanation, method: "page-overlap" }];
    let report = evaluateQuestion(question, {
      region: candidate.region,
      httpStatus: 200,
      pageText: page.text,
      prior: priors[candidate.region],
    });
    if (!passed(report)) {
      question.sources[0].claim = "";
      const retry = evaluateQuestion(question, {
        region: candidate.region,
        httpStatus: 200,
        pageText: page.text,
        prior: priors[candidate.region],
      });
      if (passed(retry)) report = retry;
    }
    if (!passed(report)) {
      failed.push({ id: candidate.id, reasons: report.reasons, quote: (report.evidenceQuote || quote).slice(0, 180) });
      continue;
    }
    question.gateReport = report;
    question.lifecycleStatus = "published";
    accepted.push(question);
    published[candidate.region].questions.push(question);
    priors[candidate.region].push(priorOf(question));
    answers[candidate.region].add(normalizeText(candidate.answer));
    poolAnswers[`${candidate.region}:${candidate.pool}`].push(candidate.answer);
  }

  await writeFile(cachePath, JSON.stringify(cache));
  const counts = {};
  for (const region of regions) counts[region] = published[region].questions.length;
  console.log(JSON.stringify({ accepted: accepted.length, failed: failed.length, counts }, null, 2));
  const byReason = {};
  for (const item of failed) {
    for (const reason of item.reasons) byReason[reason] = (byReason[reason] || 0) + 1;
  }
  console.log("REASONS", JSON.stringify(byReason));
  for (const item of failed) {
    console.log("FAIL", item.id, item.reasons.join(","));
    if (item.lead) console.log("  LEAD", item.lead);
    else if (item.quote) console.log("  QUOTE", item.quote);
  }
  if (!writeMode) return;
  const summary = JSON.parse(await readFile(new URL("reports/summary.json", root), "utf8"));
  for (const region of regions) {
    const body = `${JSON.stringify(published[region], null, 2)}\n`;
    await writeFile(new URL(`published/${region}.json`, root), body);
    await writeFile(new URL(`../../public/question-bank/${region}.json`, import.meta.url), body);
    const byCategory = {};
    const byDifficulty = {};
    const byKind = {};
    for (const question of published[region].questions) {
      byCategory[question.category] = (byCategory[question.category] || 0) + 1;
      byDifficulty[question.difficulty] = (byDifficulty[question.difficulty] || 0) + 1;
      byKind[question.kind] = (byKind[question.kind] || 0) + 1;
    }
    summary.summary[region].published = published[region].questions.length;
    summary.summary[region].byCategory = byCategory;
    summary.summary[region].byDifficulty = byDifficulty;
    summary.summary[region].byKind = byKind;
  }
  summary.generatedAt = "2026-11-02";
  await writeFile(new URL("reports/summary.json", root), `${JSON.stringify(summary, null, 2)}\n`);
  const samples = accepted.map((question) => ({
    id: question.id,
    prompt: question.prompt,
    answer: question.options[question.correct[0]],
    evidenceQuote: question.gateReport.evidenceQuote,
  }));
  await writeFile("/tmp/phase1-samples.json", JSON.stringify(samples, null, 2));
  console.log("WROTE", accepted.length);
}

function blankQuestion(candidate, options) {
  return {
    id: candidate.id,
    region: candidate.region,
    country: candidate.country,
    category: candidate.category,
    difficulty: candidate.difficulty,
    kind: "single",
    prompt: candidate.prompt,
    options,
    correct: [0],
    explanation: candidate.explanation,
    sources: [],
    origin: "generated",
  };
}

await main();
