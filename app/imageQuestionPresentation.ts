import type { RegionKey } from "./gameData.ts";

export type ImageAnswerPresentation = Readonly<{
  marker: string;
  assetRef: string;
  accessibilityDescription: string;
}>;

type ImagePresentationInput = Readonly<{
  stableId: string;
  region: RegionKey;
  visualStart: number | null;
  answerOptions: readonly Readonly<{ id: string; text: string }>[];
  imageProvenance: readonly unknown[];
}>;

type LegacyImageQuestion = Readonly<{
  region: RegionKey;
  visualStart: number;
  descriptions: readonly string[];
}>;

const legacyImageQuestions: Readonly<Record<string, LegacyImageQuestion>> = Object.freeze({
  west_q04: Object.freeze({ region: "west", visualStart: 0, descriptions: Object.freeze([
    "A bowl of reddish-orange rice with green peas and fried plantain slices.",
    "A round platter of spongy flatbread surrounding several colourful stews.",
    "A patterned bowl of pale grains topped with vegetables and pieces of chicken.",
    "A dark bowl holding a smooth white mound beside a red vegetable stew.",
  ]) }),
  west_q09: Object.freeze({ region: "west", visualStart: 4, descriptions: Object.freeze([
    "A bronze bird sculpture with its long neck curved so the head faces backward.",
    "A gold looped cross with a horizontal bar and flared lower stem.",
    "A wide circular collar made from many rows of red, blue, white and black beads.",
    "A house facade painted with bold multicoloured geometric panels around its doors and window.",
  ]) }),
  east_q04: Object.freeze({ region: "east", visualStart: 0, descriptions: Object.freeze([
    "A round platter of porous flatbread covered with several colourful stews and vegetables.",
    "A bowl of reddish-orange rice with green peas, peppers and fried plantain slices.",
    "A clay bowl of pale grains topped with carrots, chickpeas and pieces of meat.",
    "A dark bowl holding a soft white porridge beside a red tomato relish.",
  ]) }),
  east_q08: Object.freeze({ region: "east", visualStart: 4, descriptions: Object.freeze([
    "A tall dark clay pot with a narrow spout, surrounded by several small handleless cups.",
    "An engraved silver pot beside clear glasses filled with amber tea and mint leaves.",
    "A round carved wooden bowl with a strand of brown beads resting across its rim.",
    "A round charcoal grill holding assorted browned meat, sausages and chicken pieces.",
  ]) }),
  central_q04: Object.freeze({ region: "central", visualStart: 0, descriptions: Object.freeze([
    "A smooth white ball of dough-like food served beside a red and green vegetable stew.",
    "A round platter of rolled porous flatbread with several colourful stews and vegetables.",
    "A patterned bowl of pale grains topped with chickpeas and mixed vegetables.",
    "A dark bowl holding a soft white mound beside a red pepper and tomato relish.",
  ]) }),
  central_q08: Object.freeze({ region: "central", visualStart: 4, descriptions: Object.freeze([
    "A folded brown woven textile with repeating black diamonds, lines and angular motifs.",
    "A square panel of blue, green and white geometric mosaic tiles around a central star.",
    "A folded brightly coloured woven cloth with orange, green, purple and black rectangular patterns.",
    "A wide circular collar made from rows of blue, red, green, white and black beads.",
  ]) }),
  north_q04: Object.freeze({ region: "north", visualStart: 0, descriptions: Object.freeze([
    "A dark bowl of pale grains topped with chickpeas, carrots, courgettes and other vegetables.",
    "A dark bowl of reddish rice with peppers, peas and a browned piece of chicken.",
    "A round platter of porous flatbread arranged around several colourful stews.",
    "A dark bowl holding a smooth white mound beside a red and green vegetable stew.",
  ]) }),
  north_q08: Object.freeze({ region: "north", visualStart: 4, descriptions: Object.freeze([
    "An eight-pointed tile panel made from blue, green, white and ochre geometric pieces.",
    "A folded woven cloth with orange, green, blue and black stripes and rectangular motifs.",
    "A folded brown textile covered with repeating cream diamonds and angular lines.",
    "A rectangular wall panel painted with bold green, yellow, blue, black and purple geometry.",
  ]) }),
  south_q04: Object.freeze({ region: "south", visualStart: 0, descriptions: Object.freeze([
    "A plate with a firm white mound of maize meal beside a chunky red and green relish.",
    "A round platter of porous flatbread surrounding several colourful stews and vegetables.",
    "A bowl of reddish-orange rice with peas, herbs and a browned piece of chicken.",
    "A patterned bowl of pale grains topped with chickpeas, potatoes and mixed vegetables.",
  ]) }),
  south_q08: Object.freeze({ region: "south", visualStart: 4, descriptions: Object.freeze([
    "A small rectangular wooden instrument with a row of metal keys above a circular sound hole.",
    "A tall stringed instrument with a round hide-covered gourd body and two upright hand grips.",
    "A pear-shaped wooden stringed instrument with a short neck and three decorated sound holes.",
    "An hourglass-shaped rope-tension drum lying beside a curved wooden beater.",
  ]) }),
});

const normalise = (value: string) => value.toLocaleLowerCase("en").replace(/[^a-z0-9]+/g, "");
const marker = (index: number) => String.fromCharCode(65 + index);

function safeLocalAssetRef(value: string): boolean {
  return /^\/quiz-art\/(?:west|east|central|north|south)-[0-9]+\.webp$/.test(value)
    || (/^\/[A-Za-z0-9/_-]+\.[A-Za-z0-9]+$/.test(value) && !value.includes(".."));
}

function validatePresentation(
  presentation: readonly ImageAnswerPresentation[],
  answerOptions: ImagePresentationInput["answerOptions"],
): readonly ImageAnswerPresentation[] {
  if (presentation.length !== answerOptions.length || presentation.length < 2) {
    throw new Error("unsafe_image_question_presentation");
  }
  for (const [index, item] of presentation.entries()) {
    const description = normalise(item.accessibilityDescription);
    const asset = normalise(item.assetRef.split("/").at(-1) || "");
    if (item.marker !== marker(index) || !safeLocalAssetRef(item.assetRef)
      || item.accessibilityDescription.length < 24 || item.accessibilityDescription.trim() !== item.accessibilityDescription
      || answerOptions.some((option) => {
        const answer = normalise(option.text);
        return answer.length >= 4 && (description.includes(answer) || asset.includes(answer));
      })) {
      throw new Error("unsafe_image_question_presentation");
    }
  }
  return Object.freeze(presentation.map((item) => Object.freeze({ ...item })));
}

export function imageAnswerPresentations(input: ImagePresentationInput): readonly ImageAnswerPresentation[] {
  const explicit = input.imageProvenance.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("unsafe_image_question_presentation");
    const record = entry as Record<string, unknown>;
    if (typeof record.assetRef !== "string" || typeof record.accessibilityDescription !== "string") {
      throw new Error("unsafe_image_question_presentation");
    }
    return Object.freeze({ marker: marker(index), assetRef: record.assetRef, accessibilityDescription: record.accessibilityDescription });
  });
  if (explicit.length) return validatePresentation(explicit, input.answerOptions);

  const legacy = legacyImageQuestions[input.stableId];
  if (!legacy || legacy.region !== input.region || legacy.visualStart !== input.visualStart) {
    throw new Error("unsafe_image_question_presentation");
  }
  return validatePresentation(legacy.descriptions.map((accessibilityDescription, index) => Object.freeze({
    marker: marker(index),
    assetRef: `/quiz-art/${input.region}-${legacy.visualStart + index}.webp`,
    accessibilityDescription,
  })), input.answerOptions);
}

export function legacyImageQuestionStableId(region: RegionKey, questionIndex: number): string {
  return `${region}_q${String(questionIndex + 1).padStart(2, "0")}`;
}

export const publishedImageQuestionIds = Object.freeze(Object.keys(legacyImageQuestions));
