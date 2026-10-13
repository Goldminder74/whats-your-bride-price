/** Planning only: never enables cron, changes admission limits or contacts a provider. */
export function productionCapacity({gamesPerDay=5000,burstPerHour=1000,outageHours=48,limit=100,cadenceMinutes=1,days=30,bytesPerGame,requestsPerGame,deploys=2,existingCredits=0}={}) {
  for(const value of [gamesPerDay,burstPerHour,outageHours,limit,cadenceMinutes,days,deploys,existingCredits]) {
    if(!Number.isSafeInteger(value)||value<0)throw Error('invalid_capacity_input');
  }
  if(!gamesPerDay||!burstPerHour||!limit||limit>100||!cadenceMinutes||!days)throw Error('invalid_capacity_input');
  const answersPerDay=gamesPerDay*12,backlogAnswers=Math.ceil(answersPerDay*outageHours/24);
  const scheduledAnswersPerDay=Math.floor(1440/cadenceMinutes)*limit;
  const surplus=scheduledAnswersPerDay-answersPerDay;
  const catchupDays=surplus>0?backlogAnswers/surplus:Infinity;
  const report={gamesPerDay,burstPerHour,answersPerDay,backlogAnswers,limit,cadenceMinutes,scheduledAnswersPerDay,
    catchupDays,deadlineFeasible:catchupDays<=7-outageHours/24,
    sevenDayAnswerVolume:answersPerDay*7+backlogAnswers,
    qualification:'Arithmetic only; full-path timings, provider limits, holds, other records and delivery must also pass.'};
  if(bytesPerGame!==undefined||requestsPerGame!==undefined) {
    if(!Number.isFinite(bytesPerGame)||bytesPerGame<0||!Number.isSafeInteger(requestsPerGame)||requestsPerGame<0)throw Error('invalid_traffic_input');
    const monthlyGames=gamesPerDay*days,bandwidthGB=monthlyGames*bytesPerGame/1e9;
    const credits=bandwidthGB*20+monthlyGames*requestsPerGame/10000*2+deploys*15+existingCredits;
    Object.assign(report,{monthlyGames,bandwidthGB,netlifyCredits:credits,fitsPersonalIncludedCredits:credits<=1000,
      trafficQualification:'Assumes supplied transferred bytes and request counts apply to every game. Excludes taxes, other subscriptions and Cloudflare charges.'});
  }
  return report;
}

/** Explicit planning assumptions, not telemetry, admission settings or a load generator. */
export function workloadPlan(completions = 5000) {
  if (!Number.isSafeInteger(completions) || completions < 1) throw Error('invalid_capacity_input');
  const starts = completions / .7, incomplete = starts - completions;
  const answers = 12 * completions + 4 * incomplete;
  // Recovery rejudges seven previous answers; it must not create another attempt/debit.
  const recoveries = .2 * completions, recoveryRequests = recoveries * 8;
  const purchases = .03 * completions, paidPlays = .5 * completions;
  const adversePayments = purchases * .02;
  const webhookDeliveries = purchases * 3 + adversePayments * 5;
  const api = starts + answers + completions + completions + recoveryRequests
    + .2 * completions * 3 + starts + purchases * 4 + webhookDeliveries;
  const retries = api * .03, abuse = (api + retries) * .1;
  const assets = starts * 12 + answers * .3 * 4;
  return {completions, starts, incomplete, answers, recoveries, recoveryRequests,
    purchases, paidPlays, adversePayments, webhookDeliveries,
    retryRequests: retries, rejectedAbuseRequests: abuse,
    apiRequests: api + retries + abuse, assetRequests: assets,
    totalRequests: api + retries + abuse + assets,
    hourlyPeakCompletions: completions * .2,
    burstApiRequestsPerSecond: (api + retries + abuse) / 86400 * 10,
    outageAnswerBacklog: answers * 2,
    purgeRowsPerSecondFor24hCatchup: answers * 3 / 86400,
    installedPurgeRowsPerSecondAt50PercentAvailability: answers * 6 / 86400,
    qualification: '70% completion; four answers per abandonment; 20% recover after seven; 3% retries; 10% rejected abuse; 30% image answers; 50% paid play; 3% purchases. Assumptions, not observed demand.'};
}
