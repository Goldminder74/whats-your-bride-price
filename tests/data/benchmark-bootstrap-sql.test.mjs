import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {benchmarkBootstrapSql} from '../../scripts/benchmark-bootstrap-sql.mjs';
import {loadMigrationPlan} from '../../scripts/data-migrations.mjs';
import {setup} from '../helpers/cowrieCommerce.mjs';
test('isolated bootstrap packages unchanged migrations and synthetic catalogue without empty statements',async()=>{
 const c=await setup(),target=new DatabaseSync(':memory:');
 try{const input={migrations:await loadMigrationPlan(),editions:c.database.prepare('SELECT * FROM quiz_editions').all(),questions:c.database.prepare('SELECT * FROM questions').all(),at:Date.now()};
  const sql=benchmarkBootstrapSql(input);assert.equal(/;\s*;/.test(sql),false);target.exec(sql);
  assert.equal(target.prepare('SELECT COUNT(*) n FROM schema_migrations').get().n,14);
  assert.equal(target.prepare('SELECT COUNT(*) n FROM questions').get().n,150);
  assert.equal(target.prepare('PRAGMA foreign_key_check').all().length,0);
  assert.equal(target.prepare('SELECT COUNT(*) n FROM cowrie_wallets').get().n,0);
  for(const table of ['questions','quiz_editions'])assert.deepEqual(target.prepare('SELECT * FROM '+table+' ORDER BY id').all(),c.database.prepare('SELECT * FROM '+table+' ORDER BY id').all());
  assert.throws(()=>target.exec(sql)); // no silent reseed of a populated target
  assert.throws(()=>benchmarkBootstrapSql({...input,migrations:input.migrations.slice(1)}),/scope/);
 }finally{c.database.close();target.close();}
});
