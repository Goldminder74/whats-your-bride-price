import Link from "next/link";
import {
  OWNER_DASHBOARD_CAMPAIGNS,
  OWNER_DASHBOARD_EDITIONS,
  OWNER_DASHBOARD_SOURCES,
  type DashboardMetric,
  type DashboardRate,
  type OwnerDashboardReport,
} from "../db/ownerDashboard.ts";

const metricLabels: Readonly<Record<string, string>> = Object.freeze({
  visits: "Visits",
  uniqueSessions: "Unique anonymous sessions",
  quizStarts: "Quiz starts",
  firstQuestionStarts: "First-question starts",
  quizCompletions: "Quiz completions",
  resultViews: "Result views",
  shareIntentions: "Share intentions",
  shareHandoffs: "Successful browser handoffs",
});

const funnelLabels: Readonly<Record<string, string>> = Object.freeze({
  visitToStart: "Visit → quiz start",
  startToCompletion: "Quiz start → completion",
  completionToResultView: "Completion → result view",
  completionToShareIntent: "Completion → share intention",
  completionToShareHandoff: "Completion → browser handoff",
  nominationHandoffsPerCompletion: "Nomination handoffs per completed game",
  referredVisitToStart: "Referred visit → quiz start",
  challengeViewToAccept: "Challenge view → acceptance",
  challengeAcceptToCompletion: "Challenge acceptance → completion",
  storyVideoOpenToRenderComplete: "Story open → render completion",
  storyVideoRenderToShareHandoff: "Story render → browser handoff",
  offerViewToCheckoutStart: "Offer view → checkout start",
  checkoutStartToPurchase: "Checkout start → purchase",
});

const supportingGroups = Object.freeze([
  Object.freeze({ title: "Publishing & sharing", names: Object.freeze(["resultPublications", "resultUnpublications", "shareCentreOpens", "shareIntentions", "shareHandoffs"]) }),
  Object.freeze({ title: "Challenges & comparison", names: Object.freeze(["challengeCreations", "challengeViews", "challengeAcceptances", "challengeCompletions", "comparisonViews"]) }),
  Object.freeze({ title: "Nomination & referral", names: Object.freeze(["nominationOpens", "nominationShareIntentions", "nominationShareHandoffs", "referredVisits", "referredQuizStarts"]) }),
  Object.freeze({ title: "Story video", names: Object.freeze(["storyVideoOpens", "storyVideoRenderStarts", "storyVideoRenderCompletions", "storyVideoRenderFailures", "storyVideoShareIntentions", "storyVideoShareHandoffs", "storyVideoDownloads", "storyStaticFallbacks"]) }),
] as const);

const supportingLabels: Readonly<Record<string, string>> = Object.freeze({
  resultPublications: "Result publications", resultUnpublications: "Result unpublications", shareCentreOpens: "Share Centre opens", shareIntentions: "Share intentions", shareHandoffs: "Browser share handoffs",
  challengeCreations: "Challenge creations", challengeViews: "Challenge views", challengeAcceptances: "Challenge acceptances", challengeCompletions: "Challenge completions", comparisonViews: "Comparison views",
  nominationOpens: "Nomination opens", nominationShareIntentions: "Nomination share intentions", nominationShareHandoffs: "Nomination share handoffs", referredVisits: "Referred visits", referredQuizStarts: "Referred quiz starts",
  storyVideoOpens: "Story-video opens", storyVideoRenderStarts: "Render starts", storyVideoRenderCompletions: "Render completions", storyVideoRenderFailures: "Render failures", storyVideoShareIntentions: "Story share intentions", storyVideoShareHandoffs: "Story share handoffs", storyVideoDownloads: "Story downloads", storyStaticFallbacks: "Static fallbacks",
});

function number(value: number | null): string {
  return value === null ? "Unavailable" : new Intl.NumberFormat("en-GB").format(value);
}

function percentage(value: number | null): string {
  return value === null ? "Unavailable" : new Intl.NumberFormat("en-GB", { style: "percent", maximumFractionDigits: 1 }).format(value);
}

function MetricCard({ label, metric }: { label: string; metric: DashboardMetric }) {
  return <article className="owner-metric-card" data-state={metric.state} aria-label={`${label}: ${number(metric.value)}`}><p>{label}</p><strong>{number(metric.value)}</strong><small>{metric.note}</small></article>;
}

function FunnelRow({ label, value }: { label: string; value: DashboardRate }) {
  return <tr><th scope="row">{label}</th><td>{number(value.numerator)}</td><td>{number(value.denominator)}</td><td>{percentage(value.rate)}</td><td><span className="owner-state" data-state={value.state}>{value.state.replaceAll("_", " ")}</span><small>{value.note}</small></td></tr>;
}

function query(report: OwnerDashboardReport): string {
  const params = new URLSearchParams({ from: report.filters.fromDate, to: report.filters.toDate });
  if (report.filters.edition) params.set("edition", report.filters.edition);
  if (report.filters.source) params.set("source", report.filters.source);
  if (report.filters.campaign) params.set("campaign", report.filters.campaign);
  return params.toString();
}

export default function OwnerAnalyticsDashboard({ report, reviewFixture, storageUnavailable = false, analyticsEnabled = false }: { report: OwnerDashboardReport; reviewFixture?: string; storageUnavailable?: boolean; analyticsEnabled?: boolean }) {
  const hasData = Object.values(report.metrics).some((metric) => (metric.value || 0) > 0);
  const exportQuery = new URLSearchParams(query(report));
  if (reviewFixture) exportQuery.set("fixture", reviewFixture);
  return <main className="owner-dashboard" data-owner-dashboard data-review-fixture={reviewFixture || undefined}>
    <header className="owner-hero">
      <div><p className="owner-kicker">Private owner workspace</p><h1>Funnel &amp; viral coefficient</h1><p className="owner-required-notice">Consented measured traffic only. This dashboard does not represent all players.</p></div>
      <div className="owner-refresh"><span>Last refreshed</span><time dateTime={new Date(report.refreshedAt).toISOString()}>{new Date(report.refreshedAt).toLocaleString("en-GB", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" })} UTC</time></div>
    </header>

    <form className="owner-filters" method="get" aria-label="Dashboard filters">
      <label>From <input name="from" type="date" required value={report.filters.fromDate} max={report.filters.toDate} /></label>
      <label>To <input name="to" type="date" required value={report.filters.toDate} min={report.filters.fromDate} /></label>
      <label>Edition <select name="edition" defaultValue={report.filters.edition || "all"}><option value="all">All editions</option>{OWNER_DASHBOARD_EDITIONS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <label>Source <select name="source" defaultValue={report.filters.source || "all"}><option value="all">All sources</option>{OWNER_DASHBOARD_SOURCES.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <label>Campaign <select name="campaign" defaultValue={report.filters.campaign || "all"}><option value="all">All campaigns</option>{OWNER_DASHBOARD_CAMPAIGNS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      {reviewFixture && <input type="hidden" name="fixture" value={reviewFixture} />}
      <div className="owner-filter-actions"><button type="submit">Apply filters</button><Link href="/owner/analytics">Reset filters</Link></div>
      <p className="owner-mode-unsupported"><b>Game mode</b><span>Unsupported by the current analytics data contract.</span></p>
    </form>

    <aside className="owner-active-filters" aria-label="Active filter summary"><b>Active filters</b><span>{report.filterSummary}</span><Link href={`/owner/analytics/export?${exportQuery.toString()}`}>Export aggregate CSV</Link></aside>

    {storageUnavailable ? <section className="owner-empty" role="alert"><p className="owner-kicker">Report unavailable</p><h2>Analytics data is unavailable</h2><p>The dashboard failed closed without querying or exposing fallback data. No infrastructure details are shown.</p></section> : !hasData && <section className="owner-empty" role="status"><p className="owner-kicker">No measured events</p><h2>No data for these filters</h2><p>No synthetic production values are shown. Adjust the reporting period or wait for consented measured traffic.</p></section>}
    {!analyticsEnabled && <aside className="owner-analytics-disabled" role="status"><b>Analytics collection is disabled.</b><span>This report does not activate collection. It may only describe already-retained consented measured traffic.</span></aside>}

    {!storageUnavailable && <>
    <section aria-labelledby="owner-summary-title"><div className="owner-section-heading"><div><p className="owner-kicker">Selected period</p><h2 id="owner-summary-title">Summary</h2></div><p>{report.filters.fromDate}–{report.filters.toDate}, inclusive · {report.filters.timezone}</p></div><div className="owner-metric-grid">{Object.entries(metricLabels).map(([name, label]) => <MetricCard key={name} label={label} metric={report.metrics[name]} />)}</div></section>

    <section aria-labelledby="owner-funnel-title"><div className="owner-section-heading"><div><p className="owner-kicker">Numerator, denominator, rate</p><h2 id="owner-funnel-title">Funnel</h2></div><p>Small-sample warnings apply below 20 denominator events.</p></div><div className="owner-table-wrap"><table><caption>Core funnel performance for {report.filterSummary}</caption><thead><tr><th scope="col">Stage</th><th scope="col">Numerator</th><th scope="col">Denominator</th><th scope="col">Rate</th><th scope="col">Data quality</th></tr></thead><tbody>{Object.entries(funnelLabels).map(([name, label]) => <FunnelRow key={name} label={label} value={report.funnels[name]} />)}</tbody></table></div></section>

    <section className="owner-viral" aria-labelledby="owner-viral-title"><div><p className="owner-kicker">Observed, not target</p><h2 id="owner-viral-title">Viral coefficient</h2><p>Nominations per completed game × referred-visitor start rate.</p></div><div className="owner-viral-equation" aria-label={`Observed viral coefficient: ${number(report.viral.nominationsPerCompletion)} times ${percentage(report.viral.referredStartRate)} equals ${number(report.viral.value)}`}><span><b>{number(report.viral.nominationsPerCompletion)}</b><small>Nominations / completion</small></span><i>×</i><span><b>{percentage(report.viral.referredStartRate)}</b><small>Referred start rate</small></span><i>=</i><span><b>{number(report.viral.value)}</b><small>Viral coefficient</small></span></div><p className="owner-target"><b>Target marker:</b> 2.5 × 45% = 1.125. This target is not observed performance.</p><p className="owner-state" data-state={report.viral.state}>{report.viral.note}</p></section>

    <section aria-labelledby="owner-supporting-title"><div className="owner-section-heading"><div><p className="owner-kicker">Exact Prompt 16 semantics</p><h2 id="owner-supporting-title">Growth signals</h2></div><p>Intent, browser handoff, download and fallback remain separate. A handoff is not delivery, receipt or publication.</p></div><div className="owner-signal-groups">{supportingGroups.map((group) => <article key={group.title}><h3>{group.title}</h3><dl>{group.names.map((name) => <div key={name}><dt>{supportingLabels[name]}</dt><dd>{number(report.metrics[name].value)}<small>{report.metrics[name].state.replaceAll("_", " ")}</small></dd></div>)}</dl></article>)}</div></section>

    <section aria-labelledby="owner-channel-title"><div className="owner-section-heading"><div><p className="owner-kicker">Controlled identifiers only</p><h2 id="owner-channel-title">Channel performance</h2></div><p>Near-duplicate labels are not merged or substituted.</p></div><div className="owner-table-wrap"><table><caption>Aggregate controlled-channel outcomes</caption><thead><tr><th scope="col">Exact channel</th><th scope="col">Intentions</th><th scope="col">Browser handoffs</th><th scope="col">Downloads</th><th scope="col">Static fallbacks</th><th scope="col">Contract state</th></tr></thead><tbody>{report.channels.map((row) => <tr key={row.channel}><th scope="row">{row.channel}</th><td>{number(row.intents)}</td><td>{number(row.handoffs)}</td><td>{number(row.downloads)}</td><td>{number(row.staticFallbacks)}</td><td><span className="owner-state" data-state={row.state}>{row.state}</span><small>{row.note}</small></td></tr>)}</tbody></table></div></section>

    <section className="owner-comparisons" aria-labelledby="owner-comparison-title"><div className="owner-section-heading"><div><p className="owner-kicker">Separate dimensions</p><h2 id="owner-comparison-title">Edition &amp; attribution</h2></div><p>Narrow source/campaign cohorts are suppressed below 20 measured events.</p></div><div className="owner-comparison-grid"><div className="owner-table-wrap"><table><caption>Edition comparison</caption><thead><tr><th scope="col">Edition</th><th scope="col">Visits</th><th scope="col">Starts</th><th scope="col">Completions</th><th scope="col">Completion rate</th></tr></thead><tbody>{report.editions.map((row) => <tr key={row.edition}><th scope="row">{row.edition}</th><td>{row.visits}</td><td>{row.starts}</td><td>{row.completions}</td><td>{percentage(row.completionRate)}{row.smallSample && <small>Small sample</small>}</td></tr>)}</tbody></table></div><div className="owner-table-wrap"><table><caption>Stored source and campaign comparison</caption><thead><tr><th scope="col">Source</th><th scope="col">Campaign</th><th scope="col">Visits</th><th scope="col">Starts</th><th scope="col">Completions</th><th scope="col">Completion rate</th></tr></thead><tbody>{report.attribution.map((row) => <tr key={`${row.source}/${row.campaign}`}><th scope="row">{row.source}</th><td>{row.campaign}</td>{row.displayable ? <><td>{row.visits}</td><td>{row.starts}</td><td>{row.completions}</td><td>{percentage(row.completionRate)}</td></> : <td colSpan={4}>Suppressed: cohort is below the minimum sample.</td>}</tr>)}</tbody></table></div></div></section>

    <section className="owner-contract-grid" aria-labelledby="owner-contract-title"><div className="owner-section-heading"><div><p className="owner-kicker">Honest limitations</p><h2 id="owner-contract-title">Contract coverage</h2></div></div><div><article><h3>Game mode</h3><span className="owner-state" data-state="unsupported">Unsupported</span><p>{report.gameMode.note}</p><p>No game-mode filter is sent to the server or database.</p></article><article><h3>Timing</h3><span className="owner-state" data-state="unsupported">Unsupported</span><p>{report.timing.note}</p>{report.durations.length > 0 && <ul>{report.durations.map((row) => <li key={row.bucket}>{row.bucket.replaceAll("_", " ")}: {row.count}</li>)}</ul>}</article><article><h3>Retention</h3><span className="owner-state" data-state="unsupported">Unsupported</span><p>{report.retention.note}</p></article><article><h3>Royal Reveal</h3><span className="owner-state" data-state={report.commerce.enabled ? "available" : "disabled"}>{report.commerce.enabled ? "Available" : "Disabled"}</span><p>{report.commerce.note}</p><p>Offer views: {number(report.metrics.offerViews.value)}</p></article></div></section>

    <section aria-labelledby="owner-outcome-title"><div className="owner-section-heading"><div><p className="owner-kicker">Comparison outcomes</p><h2 id="owner-outcome-title">Challenge result mix</h2></div><p>Outcome totals use only the controlled values stored on comparison-outcome events.</p></div><div className="owner-outcome-grid">{[["beat", "Wins"], ["tied", "Ties"], ["did_not_beat", "Losses"]].map(([key, label]) => <article key={key}><p>{label}</p><strong>{report.outcomes[key] || 0}</strong></article>)}</div></section>
    </>}

    <aside className="owner-data-quality" aria-label="Data quality notices"><h2>Data quality &amp; privacy</h2><ul><li>Consented measured traffic only; this is not total traffic.</li><li>Only schema-version 1, non-deleted, unexpired events from currently consented sessions are included.</li><li>Unknown attribution stays unknown. Missing values are never reconstructed.</li><li>No row-level events, session hashes, properties JSON, player details, result identifiers, challenge codes or commerce identifiers reach this page or CSV.</li><li>Charts are not the sole representation: every value is available in semantic cards or tables.</li></ul></aside>
  </main>;
}
