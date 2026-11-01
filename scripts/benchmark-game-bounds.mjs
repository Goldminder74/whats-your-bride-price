import {BENCHMARK_PHASES} from './approved-benchmark-budget.mjs';
const fail=()=>{throw Error('benchmark_game_bounds_unavailable');};
// Conservative admission vectors, not a throughput forecast. Based on the local
// compiled repository profile; actual hosted observations must settle each ticket.
// A provider overrun stops the run rather than expanding these bounds.
const profiles={
 inventory:{external:40,internal:200,reads:20000,writes:100},
 start:{external:80,internal:180,reads:3000,writes:200,driveObjects:8,driveBytes:100000},
 answer:{external:16,internal:66,reads:1000,writes:30},
 recover:{external:20,internal:400,reads:5000,writes:100},
 complete:{external:40,internal:160,reads:3000,writes:250,driveObjects:5,driveBytes:100000},
 result:{external:12,internal:50,reads:1000,writes:30},
};
export function benchmarkGameBounds({phase,storageBytes,assets}){
 const limits=BENCHMARK_PHASES[phase];
 if(phase!=='B'||!Number.isSafeInteger(storageBytes)||storageBytes<0||!assets)fail();
 const storageUpper=storageBytes+20000000;
 if(storageUpper>=limits.caps.storageBytes*.8)fail();
 return command=>{
  const profile=profiles[command?.kind];if(!profile)fail();
  let assetBytes=0;
  if(['start','answer','recover'].includes(command.kind)){
   const candidates=Object.entries(assets).filter(([path])=>path.startsWith('/quiz-art/')||path.startsWith('/regions/')||path==='/avatars/adjoa-v2.webp').map(([,entry])=>entry.bytes);
   if(candidates.some(n=>!Number.isSafeInteger(n)||n<1))fail();
   // At most eight option images plus region/avatar on a cold start or refresh.
   assetBytes=candidates.sort((a,b)=>b-a).slice(0,10).reduce((n,x)=>n+x,0);
  }else if(command.kind==='result'){
   const slug={west:'west-africa',east:'east-africa',central:'central-africa',north:'north-africa',south:'southern-africa'}[command.region];if(!slug)fail();
   for(const path of ['/regions/'+slug+'.webp','/avatars/adjoa-v2.webp','/quiz-art/'+command.region+'-0.webp','/quiz-art/'+command.region+'-7.webp']){const size=assets[path]?.bytes;if(!Number.isSafeInteger(size)||size<1)fail();assetBytes+=size;}
  }
  const result={...Object.fromEntries(Object.keys(limits.caps).map(k=>[k,0])),...profile,storageBytes:storageUpper,transferBytes:4500000+assetBytes};
  if(Object.entries(result).some(([k,v])=>!Number.isSafeInteger(v)||v<0||v>limits.caps[k])||result.internal>limits.internalPerSecond)fail();
  return result;
 };
}
