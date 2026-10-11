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
