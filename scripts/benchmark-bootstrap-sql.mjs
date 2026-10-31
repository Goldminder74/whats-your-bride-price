// SQL packaging for a NEW disposable target only. Migration contents come from
// loadMigrationPlan's checksum-verified files; no existing database is reseeded.
import {MIGRATION_TABLE_SQL} from './data-migrations.mjs';
const fail=()=>{throw Error('benchmark_bootstrap_scope');};
const literal=value=>value===null?'NULL':typeof value==='number'&&Number.isSafeInteger(value)?String(value):typeof value==='string'&&!value.includes('\0')?"'"+value.replaceAll("'","''")+"'":fail();
export function benchmarkBootstrapSql({migrations,editions,questions,at}){
 if(!Number.isSafeInteger(at)||at<1||!Array.isArray(migrations)||migrations.length!==14||migrations.some((m,i)=>m.id.slice(0,4)!==String(i).padStart(4,'0')||!/^[a-f0-9]{64}$/.test(m.checksum)||!Array.isArray(m.statements)||!m.statements.length)
  ||!Array.isArray(editions)||editions.length!==5||!Array.isArray(questions)||questions.length!==150)fail();
 const statements=[MIGRATION_TABLE_SQL];
 for(const m of migrations){statements.push(...m.statements);statements.push('INSERT INTO schema_migrations(migration_id,checksum,applied_at,runner_version) VALUES('+[m.id,m.checksum,at,1].map(literal).join(',')+')');}
 for(const [table,rows] of [['quiz_editions',editions],['questions',questions]])for(const row of rows){const columns=Object.keys(row);if(!columns.length||columns.some(c=>!/^[_a-z][_a-z0-9]*$/.test(c)))fail();statements.push('INSERT INTO '+table+'('+columns.map(c=>'"'+c+'"').join(',')+') VALUES('+columns.map(c=>literal(row[c])).join(',')+')');}
 // Drizzle statements already end in ';'. Adding another creates empty
 // statements that D1's import parser rejects. Internal trigger delimiters stay.
 return statements.map(s=>s.trim().replace(/;+\s*$/,'')).join(';\n')+';\n';
}
