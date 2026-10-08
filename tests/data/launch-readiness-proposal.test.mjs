import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,readFile,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {prepareReadiness,readinessProposalPath} from "../../scripts/prepare-launch-readiness.mjs";
import {canonicalEvidenceJson} from "../../db/questionEvidence.ts";
import {loadEvidence,regions,regionPlan,seedPlan,sha256} from "../../scripts/private-test-catalogue.mjs";
import {createIsolatedDatabase,loadMigrationPlan,applyMigrationPlan} from "../../scripts/data-migrations.mjs";
import {Adapter} from "../helpers/cowrieCommerce.mjs";
import {D1QuestionSelectionRepository,selectQuestionSet} from "../../db/questionSelection.ts";

test("revised proposal is reproducible, pins eleven v2 corrections and two reserve substitutions, and simulates 30 eligible per region",async()=>{
 const root=await mkdtemp(join(tmpdir(),"wybp-readiness-proposal-")),first=join(root,"first"),second=join(root,"second"),db=createIsolatedDatabase();
 try {
  const data=await prepareReadiness(first),repeat=await prepareReadiness(second);
  const recorded=await readFile(readinessProposalPath,"utf8");assert.equal(canonicalEvidenceJson(data.manifest)+"\n",recorded);assert.deepEqual(data.manifest,repeat.manifest);
  for(const file of data.manifest.reproductionFiles)assert.equal(sha256(await readFile(join(first,file.path))),sha256(await readFile(join(second,file.path))));
  assert.equal(data.manifest.entries.length,90);assert.equal(data.manifest.humanCulturalApproval,false);assert.equal(data.manifest.lifecycle,"proposed_not_imported_or_published");
  assert.equal(data.manifest.entries.filter(e=>e.version===2).length,11);
  const swaps=data.manifest.readinessProposal.reserveSubstitutions;assert.equal(swaps.length,2);
  for(const swap of swaps){assert.ok(data.manifest.entries.some(e=>e.stableId===swap.proposed));assert.ok(!data.manifest.entries.some(e=>e.stableId===swap.excluded));}
  for(const pack of Object.values(data.packs))for(const b of pack.bundles){assert.equal(b.question.lifecycleStatus,"draft");assert.equal(b.question.publishedAt,null);if(b.question.version===2){assert.equal(b.evidenceRevisionProvenance.version,1);assert.notEqual(b.evidenceRevisionProvenance.evidenceBundleSha256,b.evidenceBundleSha256);}}
  const held=data.packs.central.currentAuditHolds[0].stableId,packPath=join(first,"central-evidence-pack.json"),manifestPath=join(first,"manifest.json"),packBytes=await readFile(packPath),manifestBytes=await readFile(manifestPath);
  const tampered=JSON.parse(packBytes),current=tampered.publicationReady[0];tampered.publicationReady[0]=held;tampered.reserves=tampered.reserves.map(id=>id===held?current:id);
  await writeFile(packPath,canonicalEvidenceJson(tampered)+"\n");const evidenceManifest=JSON.parse(manifestBytes);evidenceManifest.hashes.central=sha256(await readFile(packPath));await writeFile(manifestPath,canonicalEvidenceJson(evidenceManifest)+"\n");
  await assert.rejects(loadEvidence(first),/held_evidence_cannot_be_selected/);await writeFile(packPath,packBytes);await writeFile(manifestPath,manifestBytes);
  applyMigrationPlan(db,await loadMigrationPlan());const adapter=new Adapter(db),bind=rows=>rows.map(r=>adapter.prepare(r.sql).bind(...r.params));await adapter.batch(bind(seedPlan(data.seed)));await adapter.batch(bind(seedPlan(data.seed)));
  const repo=new D1QuestionSelectionRepository(adapter),now=Date.now();
  for(const region of regions){await adapter.batch(bind(regionPlan("import",region,data,now)));assert.equal((await repo.getCandidates(region,now)).length,12);for(let i=0;i<2;i++)await adapter.batch(bind(regionPlan("publish",region,data,now)));const candidates=await repo.getCandidates(region,now);assert.equal(candidates.length,30);assert.equal((await selectQuestionSet({region,candidates,now,minimumEligibleCount:30,randomSource:b=>{b.fill(7);return b;}})).questions.length,12);}
  assert.equal(db.prepare("SELECT COUNT(*) n FROM questions").get().n,150);assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(),[]);
  const old=JSON.parse(await readFile("data/question-bank/launch/publication-manifest-v1.json","utf8"));assert.equal(sha256(canonicalEvidenceJson(old)+"\n"),data.manifest.readinessProposal.priorPublicationManifestSha256);
  // Live operator remains pinned to v1; using v2 requires a later explicit owner decision.
  assert.notEqual(recorded,canonicalEvidenceJson(old)+"\n");assert.deepEqual((await loadEvidence(first)).manifest,data.manifest);
  console.log(JSON.stringify({proposalSha256:sha256(recorded),regions:Object.fromEntries(regions.map(r=>[r,30])),sourceLifecycle:"all draft; isolated simulation only"}));
 }finally {db.close();await rm(root,{recursive:true,force:true});}
});
