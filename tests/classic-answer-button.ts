import type { Page } from "@playwright/test";
import { imageAnswerPresentations, legacyImageQuestionStableId } from "../app/imageQuestionPresentation.ts";
import type { Question, RegionKey } from "../app/gameData.ts";

// Pick the intended canonical answer by its content, never by a display letter.
export function classicAnswerButton(page: Page, edition: RegionKey, index: number, question: Question, optionIndex: number) {
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const buttons = page.locator(".answer-grid > button");
  if (question.kind !== "image") return buttons.filter({ has: page.locator("b", { hasText: new RegExp(`^${escape(question.options[optionIndex])}$`) }) });
  const presentation = imageAnswerPresentations({
    stableId: legacyImageQuestionStableId(edition, index), region: edition,
    visualStart: question.visualStart ?? null,
    answerOptions: question.options.map((text, i) => ({ id: `o${i + 1}`, text })), imageProvenance: [],
  })[optionIndex];
  return buttons.filter({ has: page.locator(`img[src="${presentation.assetRef}"]`) });
}
