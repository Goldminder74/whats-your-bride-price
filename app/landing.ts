/** Ad links should open the first question. A plain edition link stays on the start screen. */
export function adTrafficShouldStart(search: string): boolean {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  if (params.get("play") === "1") return true;
  return ["utm_source", "utm_medium", "utm_campaign", "utm_content"].some((key) => Boolean(params.get(key)?.trim()));
}
