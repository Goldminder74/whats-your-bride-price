import type { RegionKey } from "../app/gameData.ts";

/**
 * Country-to-region map aligned with this game's five editions.
 * Southern Africa here includes the countries the live game already treats as
 * southern (Zimbabwe, Zambia, Malawi, Mozambique), even where a UN geoscheme
 * file puts some of them in Eastern Africa. Sudan stays north because the
 * classic north edition places Kush there. Mauritania stays north with the
 * Maghreb couscous heritage the north edition already teaches. Angola stays
 * central with Mbanza Kongo.
 */
const COUNTRY_REGION: Record<string, RegionKey> = {
  benin: "west",
  "burkina faso": "west",
  "cabo verde": "west",
  "cape verde": "west",
  "cote d'ivoire": "west",
  "ivory coast": "west",
  gambia: "west",
  "the gambia": "west",
  ghana: "west",
  guinea: "west",
  "guinea-bissau": "west",
  liberia: "west",
  mali: "west",
  niger: "west",
  nigeria: "west",
  senegal: "west",
  "sierra leone": "west",
  togo: "west",
  burundi: "east",
  comoros: "east",
  djibouti: "east",
  eritrea: "east",
  ethiopia: "east",
  kenya: "east",
  madagascar: "east",
  mauritius: "east",
  rwanda: "east",
  seychelles: "east",
  somalia: "east",
  "south sudan": "east",
  tanzania: "east",
  uganda: "east",
  angola: "central",
  cameroon: "central",
  "central african republic": "central",
  chad: "central",
  congo: "central",
  "republic of the congo": "central",
  "democratic republic of the congo": "central",
  "dr congo": "central",
  "drc": "central",
  "equatorial guinea": "central",
  gabon: "central",
  "sao tome and principe": "central",
  algeria: "north",
  egypt: "north",
  libya: "north",
  mauritania: "north",
  morocco: "north",
  sudan: "north",
  tunisia: "north",
  "western sahara": "north",
  botswana: "south",
  eswatini: "south",
  swaziland: "south",
  lesotho: "south",
  malawi: "south",
  mozambique: "south",
  namibia: "south",
  "south africa": "south",
  zambia: "south",
  zimbabwe: "south",
};

const REGION_LABEL: Record<RegionKey, string[]> = {
  west: ["west africa", "western africa"],
  east: ["east africa", "eastern africa"],
  central: ["central africa", "middle africa"],
  north: ["north africa", "northern africa"],
  south: ["southern africa", "south africa region"],
};

export function normalizeCountryName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘]/g, "'")
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/[^a-z' -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function countryRegion(country: string): RegionKey | null {
  const key = normalizeCountryName(country);
  return COUNTRY_REGION[key] ?? null;
}

export function scopeFitsRegion(scope: string | null | undefined, region: RegionKey): boolean {
  if (!scope || !scope.trim()) return false;
  const normalized = normalizeCountryName(scope);
  if (REGION_LABEL[region].includes(normalized)) return true;
  const parts = scope.split(/[;/]/).map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return false;
  return parts.every((part) => countryRegion(part) === region);
}
