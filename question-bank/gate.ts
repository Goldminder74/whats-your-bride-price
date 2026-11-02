import type { RegionKey } from "../app/gameData.ts";
import { scopeFitsRegion } from "./regions.ts";
import { noteReasons, sensitivityReasons } from "./sensitivity.ts";
import { answerLeaks, contentTokens, jaccard, normalizeText, promptNamesAnswer, supportingSentence } from "./text.ts";
import type { BankQuestion, GateReport, SupportMethod } from "./types.ts";

const ID = /^(west|east|central|north|south)_[a-z0-9][a-z0-9_-]{2,55}$/;

export type GateContext = {
  region: RegionKey;
  httpStatus: number | null;
  pageText?: string | null;
  prior: readonly { id: string; prompt: string; country: string; category: string; correctText: string }[];
};

const SCAFFOLD = /which (?:language point|popular-culture name|sporting name|historical name|music or dance name|cloth or dress style|wedding custom|place|dish|person|celebration|saying) is|fill the blank|the name to write is|which of these is|matches this description|in everyday speech|who is the sport|what is the year\b|^what is (?:live|born|chosen|accused)\b|capital of \?|\ba and\b|\b(?:in|of|from|for|at|by|with|and|the|a|an|behalf)\s*\?$|what festival is a festival|according to unesco|\bunesco\b|which answer fits the sourced fact|^(?:what is|what do you call|where is) (?:developing|contained|central|declared|inscribed|extending|considered)\b|in which year did become\b|^what is the (?:\w+\s+){0,3}\w+s of\b/i;
const VAGUE = /\b(?:current champion|currently holds|before the next generation|these days|right now|reigning)\b/i;

function blankReport(): GateReport {
  return {
    schema: "pass",
    answerKey: "pass",
    options: "pass",
    source: { status: "pass", method: "unchecked", http: null },
    duplicate: "pass",
    sensitivity: "pass",
    ambiguity: "pass",
    region: "pass",
    reasons: [],
    evidenceQuote: null,
    editorial: { clarity: 1, fun: 1, accuracy: 1, method: "editorial-rules" },
  };
}

function fail(report: GateReport, key: "schema" | "answerKey" | "options" | "duplicate" | "sensitivity" | "ambiguity" | "region", reason: string) {
  report[key] = "fail";
  report.reasons.push(reason);
}

export function evaluateQuestion(question: BankQuestion, context: GateContext): GateReport {
  const report = blankReport();
  const options = question.options || [];
  const correct = question.correct || [];
  if (!ID.test(question.id) || !question.id.startsWith(`${question.region}_`)) fail(report, "schema", "schema_id");
  if (question.region !== context.region) fail(report, "schema", "schema_region");
  if (!question.prompt || question.prompt.trim() !== question.prompt || question.prompt.length < 12 || question.prompt.length > 400) fail(report, "schema", "schema_prompt");
  if (!question.explanation || question.explanation.length < 20 || question.explanation.length > 800) fail(report, "schema", "schema_explanation");
  if (!["single", "multi", "complete", "image"].includes(question.kind)) fail(report, "schema", "schema_kind");
  if (!["easy", "medium", "hard"].includes(question.difficulty)) fail(report, "schema", "schema_difficulty");
  if (!question.category || question.category.length < 3) fail(report, "schema", "schema_category");
  if (/\u2014|\u2013/.test(`${question.prompt} ${question.explanation} ${options.join(" ")}`)) fail(report, "schema", "schema_dash");

  if (options.length !== 4) fail(report, "options", "options_count");
  const seen = new Set<string>();
  for (const option of options) {
    const key = normalizeText(option);
    if (!option || option.length > 180 || seen.has(key)) fail(report, "options", "options_overlap");
    seen.add(key);
  }
  const sorted = [...options].map(normalizeText).sort((a, b) => b.length - a.length);
  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      if (sorted[j].length >= 4 && sorted[i].includes(sorted[j])) fail(report, "options", "options_nested");
    }
  }
  if (options.some((option) => /^(?:all|none) of the above$/i.test(option.trim()))) fail(report, "options", "options_above");
  const yearish = options.map((option) => /^\d{3,4}\b/.test(option.trim()));
  if (yearish.some(Boolean) && yearish.some((value) => !value)) fail(report, "options", "options_type");
  if (/\bcapital\b/i.test(question.prompt) && options.some((option) => /\b(?:river|lake|mount|mountain|falls|delta|desert)\b/i.test(option))) {
    fail(report, "options", "options_type");
  }

  const uniqueCorrect = [...new Set(correct)];
  const inRange = uniqueCorrect.every((index) => Number.isInteger(index) && index >= 0 && index < options.length);
  if (!inRange || uniqueCorrect.length !== correct.length) fail(report, "answerKey", "answer_key_range");
  if (question.kind === "multi") {
    if (uniqueCorrect.length !== 3) fail(report, "answerKey", "answer_key_multi");
  } else if (uniqueCorrect.length !== 1) {
    fail(report, "answerKey", "answer_key_single");
  }

  const source = question.sources?.[0];
  const answers = uniqueCorrect.map((index) => options[index] || "");
  let method: SupportMethod | "unchecked" = "unchecked";
  let quote: string | null = null;
  if (!source || !/^https:\/\//.test(source.url) || source.url.length > 300) {
    report.source = { status: "fail", method, http: context.httpStatus };
    report.reasons.push("source_missing");
  } else if (context.httpStatus === null || context.httpStatus < 200 || context.httpStatus >= 400) {
    report.source = { status: "fail", method, http: context.httpStatus };
    report.reasons.push("source_http");
  } else if (context.pageText) {
    method = "evidence-quote";
    quote = supportingSentence(context.pageText, question.prompt, source.claim || "", answers);
    if (!quote) {
      report.source = { status: "fail", method, http: context.httpStatus };
      report.reasons.push("source_support");
    } else if (question.category === "WEDDINGS" && !/wedding|marriage|bride|groom|nuptial|engagement/i.test(quote)) {
      report.source = { status: "fail", method, http: context.httpStatus };
      report.reasons.push("source_wedding");
    } else {
      report.source = { status: "pass", method, http: context.httpStatus };
      const quoteNorm = normalizeText(quote);
      for (const option of options) {
        if (answers.includes(option)) continue;
        const name = normalizeText(option);
        if (name.length >= 5 && quoteNorm.includes(name)) {
          fail(report, "ambiguity", "ambiguity_distractor");
          break;
        }
      }
    }
  } else {
    report.source = { status: "fail", method, http: context.httpStatus };
    report.reasons.push("source_support");
  }
  report.evidenceQuote = quote;

  const promptKey = normalizeText(question.prompt);
  const correctText = uniqueCorrect.map((index) => normalizeText(options[index] || "")).join(" ");
  for (const prior of context.prior) {
    if (prior.id === question.id) {
      fail(report, "duplicate", "duplicate_id");
      break;
    }
    if (normalizeText(prior.prompt) === promptKey || jaccard(prior.prompt, question.prompt) >= 0.72) {
      fail(report, "duplicate", "duplicate_prompt");
      break;
    }
    if (
      prior.country === question.country
      && prior.category === question.category
      && prior.correctText === correctText
      && jaccard(prior.prompt, question.prompt) >= 0.45
    ) {
      fail(report, "duplicate", "duplicate_claim");
      break;
    }
  }

  const sensitive = [
    ...sensitivityReasons(`${question.prompt}\n${question.explanation}\n${options.join("\n")}`),
    ...noteReasons(question.sensitivityNotes),
  ];
  if (sensitive.length) {
    report.sensitivity = "fail";
    for (const reason of sensitive) report.reasons.push(reason);
  }

  if (question.kind !== "multi" && uniqueCorrect.length === 1 && context.pageText && source?.claim) {
    const claimTokens = new Set(contentTokens(source.claim));
    const score = (text: string) => contentTokens(text).filter((token) => claimTokens.has(token)).length;
    const winner = score(options[uniqueCorrect[0]] || "");
    const rival = options.some((option, index) => !uniqueCorrect.includes(index) && score(option) > winner && score(option) >= 2);
    if (rival) fail(report, "ambiguity", "ambiguity_claim");
  }
  if (report.answerKey === "fail") fail(report, "ambiguity", "ambiguity_key");

  if (!scopeFitsRegion(question.country, question.region)) fail(report, "region", "region_country");

  const copy = `${question.prompt} ${question.explanation}`;
  if (SCAFFOLD.test(question.prompt)) fail(report, "schema", "schema_scaffold");
  if (/\b(?:accused of|rape|raping|beating|murder|torture)\b/i.test(question.prompt)) fail(report, "sensitivity", "sensitivity_trauma");
  if (answerLeaks(question.prompt, options, uniqueCorrect) || uniqueCorrect.some((index) => promptNamesAnswer(question.prompt, options[index] || ""))) {
    fail(report, "answerKey", "answer_leak");
  }
  if (!question.prompt.trim() || !question.prompt.trim().endsWith("?")) fail(report, "schema", "schema_prompt");
  const correctNorms = new Set(uniqueCorrect.map((index) => normalizeText(options[index] || "")));
  if (options.some((option, index) => !uniqueCorrect.includes(index) && correctNorms.has(normalizeText(option)))) {
    fail(report, "options", "options_overlap");
  }
  if (VAGUE.test(copy) || /\b(?:most famous|best known|best-known)\b/i.test(question.prompt) || (/\b(?:world record|olympic champion|world champion|african champion)\b/i.test(copy) && !/\b(?:19|20)\d{2}\b/.test(copy))) {
    fail(report, "ambiguity", "ambiguity_vague");
  }

  const scaffold = SCAFFOLD.test(question.prompt);
  const clarity = !scaffold && question.prompt.length >= 28 && question.prompt.length <= 200 && /[?]$/.test(question.prompt.trim()) ? 5 : 2;
  const fun = scaffold || /according to the source|name to write|language point/i.test(question.prompt) ? 1 : 5;
  const accuracy = quote ? 5 : 1;
  report.editorial = { clarity, fun, accuracy, method: "editorial-rules" };
  if (clarity < 4) report.reasons.push("editorial_clarity");
  if (fun < 4) report.reasons.push("editorial_fun");
  if (accuracy < 4) report.reasons.push("editorial_accuracy");

  report.reasons = [...new Set(report.reasons)];
  return report;
}

export function passed(report: GateReport): boolean {
  return report.reasons.length === 0
    && report.schema === "pass"
    && report.answerKey === "pass"
    && report.options === "pass"
    && report.source.status === "pass"
    && report.duplicate === "pass"
    && report.sensitivity === "pass"
    && report.ambiguity === "pass"
    && report.region === "pass";
}
