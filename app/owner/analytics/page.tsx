import { notFound } from "next/navigation";
import OwnerAnalyticsDashboard from "../../OwnerAnalyticsDashboard.tsx";
import { activeFeatureFlags } from "../../featureFlags.ts";
import { getOwnerDashboardAccess } from "../../ownerDashboardAuth.ts";
import { getOwnerDashboardRuntime, ownerDashboardReviewFixturesEnabled } from "../../ownerDashboardRuntime.ts";
import { buildOwnerDashboardReport, emptyOwnerDashboardSnapshot, OwnerDashboardValidationError, parseOwnerDashboardFilters } from "../../../db/ownerDashboard.ts";
import "../../ownerDashboard.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Private analytics workspace", robots: { index: false, follow: false, nocache: true } };

type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined> };

function serverNow(): number { return Date.now(); }

async function dashboardProps(raw: Record<string, string | string[] | undefined>, fixtureValue: string | undefined) {
  const filterValues = Object.fromEntries(Object.entries(raw).filter(([key]) => key !== "fixture"));
  try {
    const filters = parseOwnerDashboardFilters(filterValues);
    const runtime = await getOwnerDashboardRuntime(fixtureValue);
    if (!runtime) return { report: buildOwnerDashboardReport(emptyOwnerDashboardSnapshot(), filters), reviewFixture: fixtureValue, storageUnavailable: true };
    const now = serverNow();
    const snapshot = await runtime.repository.aggregate(filters, now);
    return { report: buildOwnerDashboardReport(snapshot, filters, now, runtime.commerceEnabled), reviewFixture: runtime.review ? fixtureValue || "healthy" : undefined, storageUnavailable: false };
  } catch (error) {
    if (error instanceof OwnerDashboardValidationError) notFound();
    const filters = parseOwnerDashboardFilters({});
    return { report: buildOwnerDashboardReport(emptyOwnerDashboardSnapshot(), filters), reviewFixture: fixtureValue, storageUnavailable: true };
  }
}

export default async function OwnerAnalyticsPage({ searchParams }: PageProps) {
  if (!activeFeatureFlags.owner_dashboard) notFound();
  const access = await getOwnerDashboardAccess();
  if (!access.authorized) notFound();
  const raw = searchParams ? await Promise.resolve(searchParams) : {};
  const fixtureValue = ownerDashboardReviewFixturesEnabled && typeof raw.fixture === "string" ? raw.fixture : undefined;
  const props = await dashboardProps(raw, fixtureValue);
  return <OwnerAnalyticsDashboard {...props} analyticsEnabled={activeFeatureFlags.first_party_analytics} />;
}
