// Explicit local-only diagnostic; never creates a hosted client or loads secrets.
import {writeFile,mkdir} from 'node:fs/promises';
import {localStockRecovery} from '../tests/helpers/localStockRecovery.mjs';
const args=process.argv.slice(2);if(args.length!==1||!/^--local-games=\d+$/.test(args[0]))throw Error('Use --local-games=1..45000; no hosted execution supported');
const games=Number(args[0].split('=')[1]);
const report=await localStockRecovery({games,progress:phase=>process.stdout.write(JSON.stringify({localOnly:true,phase,games})+'\n')});
await mkdir('outputs/authority-preparation',{recursive:true});await writeFile('outputs/authority-preparation/local-schema-recovery-'+games+'.json',JSON.stringify(report,null,2)+'\n');process.stdout.write(JSON.stringify(report)+'\n');
