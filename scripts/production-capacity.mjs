/** Planning only: never enables cron, changes admission limits or contacts a provider. */
export function productionCapacity({gamesPerDay=5000,burstPerHour=500,outageHours=48,limit=100,cadenceMinutes=1,days=30,bytesPerGame,requestsPerGame,deploys=2,existingCredits=0}={}) {
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
  const storedAnswerRows=12*completions;
  // Recovery rejudges seven previous answers; it must not create another attempt/debit.
  const recoveries = .2 * completions, recoveryRequests = recoveries * 8;
  const purchases = .03 * completions, paidPlays = .5 * completions;
  const adversePayments = purchases * .02;
  const webhookDeliveries = purchases * 3 + adversePayments * 5;
  const api = starts + answers + completions + completions + recoveryRequests
    + .2 * completions * 3 + starts + purchases * 4 + webhookDeliveries;
  const retries = api * .03, abuse = (api + retries) * .1;
  const assets = starts * 12 + answers * .3 * 4;
  return {completions, starts, incomplete, answers,answerJudgements:answers,storedAnswerRows,incompleteAnswerJudgements:4*incomplete,recoveries,recoveryRequests,
    purchases, paidPlays, adversePayments, webhookDeliveries,
    retryRequests: retries, rejectedAbuseRequests: abuse,
    apiRequests: api + retries + abuse, assetRequests: assets,
    totalRequests: api + retries + abuse + assets,
    hourlyPeakCompletions: completions / 10,
    burstApiRequestsPerSecond: (api + retries + abuse) / 86400 * 10,
    outageAnswerBacklog: storedAnswerRows * 2,
    purgeRowsPerSecondFor24hCatchup: storedAnswerRows * 3 / 86400,
    installedPurgeRowsPerSecondAt50PercentAvailability: storedAnswerRows * 6 / 86400,
    qualification: '70% completion; four read-only judgements per abandonment, no stored answer rows until completion; 20% recover after seven; 3% retries; 10% rejected abuse; 30% image answers; 50% paid play; 3% purchases. 500 completions/hour at the5,000/day target; brief API spike assumes10x daily average. Assumptions, not observed demand.'};
}

/** Answer-row arithmetic only. Never installs a cadence or treats held rows as
 * deletable; complete authority/retention pass cost and stock must be measured. */
export function retentionSchedulePlan({completionsPerDay=5000,intervalSeconds=30,successfulFraction=.5,outageHours=48,deadlineDays=7,batch=100}={}){
 if(![completionsPerDay,intervalSeconds,outageHours,deadlineDays,batch].every(n=>Number.isSafeInteger(n)&&n>0)||batch>100||!Number.isFinite(successfulFraction)||successfulFraction<=0||successfulFraction>1||outageHours>=deadlineDays*24)throw Error('invalid_capacity_input');
 const incoming=completionsPerDay*12,backlog=incoming*outageHours/24,passesPerDay=Math.floor(86400/intervalSeconds),effective=passesPerDay*batch*successfulFraction,surplus=effective-incoming,catchupDays=surplus>0?backlog/surplus:Infinity;
 return {incomingAnswersPerDay:incoming,outageAnswerBacklog:backlog,passesPerDay,effectiveAnswersPerDay:effective,catchupDays,remainingDeadlineDays:deadlineDays-outageHours/24,answerDeadlineFeasible:catchupDays<=deadlineDays-outageHours/24,qualification:'Arithmetic proposal only; includes ongoing arrivals and unsuccessful passes. Other tables, holds, journal delivery, snapshots, repeated outages and provider timing/cost remain independent gates. No schedule activated.'};
}
