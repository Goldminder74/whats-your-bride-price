import {BENCHMARK_PHASES} from './approved-benchmark-budget.mjs';
import {benchmarkGameBounds} from './benchmark-game-bounds.mjs';
const fail=()=>{throw Error('benchmark_operation_bounds_unavailable');};
// Admission ceilings, never measurements or permission to expand phase caps.
const profiles={
 provision:{external:70,internal:0,reads:0,writes:0,driveObjects:17,driveBytes:0},
 commission:{external:150,internal:450,reads:30000,writes:2000,driveObjects:12,driveBytes:1000000},
 'fixture-step':{external:40,internal:450,reads:30000,writes:2500,driveObjects:4,driveBytes:250000},
 fixture:{external:8,internal:100,reads:100000,writes:0},
 arrivals:{external:40,internal:150,reads:15000,writes:500,driveObjects:3,driveBytes:40000},
 purge:{external:40,internal:200,reads:250000,writes:3000,driveObjects:3,driveBytes:50000},
 flush:{external:45,internal:180,reads:15000,writes:300,driveObjects:2,driveBytes:1500000},
 capture:{external:100,internal:450,reads:100000,writes:1500,driveObjects:8,driveBytes:2000000},
 'inspect-fence':{external:8,internal:10,reads:10,writes:0},
 'inventory-info':{external:8,internal:50,reads:20000,writes:0},
 'inventory-page':{external:50,internal:150,reads:300,writes:100},
 'root-put':{external:30,internal:100,reads:200,writes:100,driveObjects:1,driveBytes:4000000},
 'root-get':{external:20,internal:50,reads:100,writes:0},
 'custody-put':{external:30,internal:100,reads:200,writes:100,driveObjects:1,driveBytes:4000000},
 'custody-get':{external:20,internal:50,reads:100,writes:0},
 'simulate-index-loss':{external:30,internal:150,reads:20000,writes:20000},
 'recover-index':{external:60,internal:250,reads:2000,writes:500},
 'restore-audit':{external:60,internal:300,reads:30000,writes:200},
 'restore-clear':{external:40,internal:150,reads:100000,writes:500000},
 'restore-import':{external:60,internal:450,reads:30000,writes:30000},
 'restore-verify':{external:60,internal:300,reads:30000,writes:200},
};
export function benchmarkOperationBounds({phase,storageBytes,assets}){
 if(!['B','C'].includes(phase)||!Number.isSafeInteger(storageBytes)||storageBytes<0)fail();
 const limits=BENCHMARK_PHASES[phase],game=phase==='B'?benchmarkGameBounds({phase,storageBytes,assets}):null;
 return command=>{
  if(phase==='B'&&['inventory','start','answer','recover','complete','result'].includes(command?.kind))return game(command);
  if(phase==='C'&&command?.kind==='inventory')return {...Object.fromEntries(Object.keys(limits.caps).map(k=>[k,0])),external:40,internal:200,reads:20000,writes:100,storageBytes:Math.max(storageBytes,100000000),transferBytes:12000000};
  const profile=profiles[command?.kind];if(!profile||phase==='B'&&!['provision','commission'].includes(command.kind))fail();
  const value={...Object.fromEntries(Object.keys(limits.caps).map(k=>[k,0])),...profile,storageBytes:Math.max(storageBytes,phase==='B'?20000000:100000000),transferBytes:12000000};
  if(Object.entries(value).some(([k,n])=>!Number.isSafeInteger(n)||n<0||n>limits.caps[k])||value.internal>limits.internalPerSecond||value.storageBytes>=limits.caps.storageBytes*.8)fail();return value;
 };
}
