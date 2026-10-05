import type { FeatureFlags } from "./featureFlags.ts";

export const PRIVATE_TEST = Object.freeze({
  origin: "https://wybp-protected-test.netlify.app",
  workerOrigin: "https://wybp-test-r001.ayo-m-ayeni.workers.dev",
  workerName: "wybp-test-r001",
  projectId: "edee23f4-b86f-4975-8859-9c4be03ebbc0",
  accountId: "b6b22a9a87b5758725e5c499782160af",
  databaseName: "wybp-test-d1-r001",
});
export type PrivateTestProfile = "off" | "data" | "payments";
export function validatePrivateTestProfile(value: unknown): PrivateTestProfile {
  if (value === undefined || value === "off") return "off";
  if (value === "data" || value === "payments") return value;
  throw new Error("Invalid private test profile");
}
export function validateTestDatabaseId(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value)
    || value === "00000000-0000-4000-8000-000000000000" || value === "00000000-0000-0000-0000-000000000000") {
    throw new Error("The isolated test D1 UUID must be supplied after provisioning");
  }
  return value;
}
export function assertPrivateTestFlags(profile: PrivateTestProfile, flags: FeatureFlags): void {
  const allowed = profile === "off" ? [] : ["random_quick_play", "cowrie_economy", ...(profile === "payments" ? ["commerce"] : [])];
  for (const [name, enabled] of Object.entries(flags)) {
    if (enabled !== allowed.includes(name)) throw new Error(`Private test profile/feature mismatch: ${name}`);
  }
}
declare const __WYBP_PRIVATE_TEST_PROFILE__: PrivateTestProfile | undefined;
export const privateTestProfile = typeof __WYBP_PRIVATE_TEST_PROFILE__ === "string"
  ? validatePrivateTestProfile(__WYBP_PRIVATE_TEST_PROFILE__) : "off";

export function privateTestRuntimeReady(env: Record<string, unknown>, profile = privateTestProfile): boolean {
  return profile !== "off" && env.WYBP_PRIVATE_TEST_PROFILE === profile
    && env.WYBP_NETLIFY_SITE_URL === PRIVATE_TEST.origin && env.WYBP_NETLIFY_PROJECT_ID === PRIVATE_TEST.projectId
    && env.WYBP_TEST_WORKER_ORIGIN === PRIVATE_TEST.workerOrigin && Boolean(env.DB);
}
