import { getChatGPTUser } from "./chatgpt-auth.ts";
import { authorizeOwnerDashboardSubject, OWNER_DASHBOARD_ALLOWLIST_ENV, type OwnerDashboardAccess } from "./ownerDashboardAccess.ts";

export async function getOwnerDashboardAccess(): Promise<OwnerDashboardAccess> {
  const user = await getChatGPTUser();
  return authorizeOwnerDashboardSubject(user?.userId || null, process.env[OWNER_DASHBOARD_ALLOWLIST_ENV]);
}

export function safeOwnerDashboardExportRequest(request: Request): boolean {
  const url = new URL(request.url);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !local) return false;
  return request.headers.get("sec-fetch-site") === "same-origin";
}
