export const OWNER_DASHBOARD_ALLOWLIST_ENV = "WYBP_OWNER_DASHBOARD_ALLOWED_SUBJECTS" as const;
const subjectPattern = /^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,127}$/;

export type OwnerDashboardIdentity = Readonly<{ subject: string }>;
export type OwnerDashboardAccess = Readonly<{
  authorized: boolean;
  identity: OwnerDashboardIdentity | null;
}>;

export function parseOwnerDashboardAllowlist(value: string | undefined): ReadonlySet<string> | null {
  if (!value?.trim()) return null;
  const entries = value.split(",").map((entry) => entry.trim());
  if (entries.length < 1 || entries.length > 20 || entries.some((entry) => !subjectPattern.test(entry))) return null;
  const unique = new Set(entries);
  return unique.size === entries.length ? unique : null;
}

export function authorizeOwnerDashboardSubject(
  subject: string | null,
  allowlistValue: string | undefined,
): OwnerDashboardAccess {
  const allowlist = parseOwnerDashboardAllowlist(allowlistValue);
  if (!subject || !subjectPattern.test(subject) || !allowlist || !allowlist.has(subject)) {
    return Object.freeze({ authorized: false, identity: null });
  }
  return Object.freeze({ authorized: true, identity: Object.freeze({ subject }) });
}
