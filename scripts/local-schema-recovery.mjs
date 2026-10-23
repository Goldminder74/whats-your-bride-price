// Explicit local-only diagnostic; never creates a hosted client or loads secrets.
import {writeFile,mkdir} from 'node:fs/promises';
import {localStockRecovery} from '../tests/helpers/localStockRecovery.mjs';
const args=process.argv.slice(2),retained=args.length===1&&args[0]==='--local-retained-90d';if(!retained&&(args.length!==1||!/^--local-games=\d+$/.test(args[0])))throw Error('Use --local-games=1..45000 or --local-retained-90d; no hosted execution supported');
const games=retained?450000:Number(args[0].split('=')[1]);
const report=await localStockRecovery({games,profile:retained?'retained-90d':'sample',progress:phase=>process.stdout.write(JSON.stringify({localOnly:true,phase,games})+'\n')});
await mkdir('outputs/authority-preparation',{recursive:true});await writeFile('outputs/authority-preparation/local-schema-recovery-'+games+'.json',JSON.stringify(report,null,2)+'\n');process.stdout.write(JSON.stringify(report)+'\n');
