import { createHash } from "node:crypto";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { PRIVATE_TEST, validateTestDatabaseId } from "../app/privateTestProfile.ts";
import { canonicalEvidenceJson, validateEvidenceBundle } from "../db/questionEvidence.ts";
import { parseCsvRows } from "../db/questionBankWorkflow.ts";
import { buildDevelopmentSeed, developmentSeedStatements,SEED_TIMESTAMP_UTC_MS } from "../db/seeds/development.ts";
import { loadMigrationPlan,createIsolatedDatabase,applyMigrationPlan } from "./data-migrations.mjs";

export const regions = ["west", "east", "central", "north", "south"];
const draftDirectories = {west:"west-africa",east:"east-africa",central:"central-africa",north:"north-africa",south:"southern-africa"};
export const publicationManifestPath = "data/question-bank/launch/publication-manifest-v1.json";
export const sha256 = value => createHash("sha256").update(value).digest("hex");
const canonicalHash = value => sha256(canonicalEvidenceJson(value));
export const SCHEMA_QUERY = "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT IN ('schema_migrations','d1_migrations') AND sql IS NOT NULL ORDER BY type,name";
const schemaHash = rows => canonicalHash(rows.map(row => ({type:row.type,name:row.name,tbl_name:row.tbl_name,sql:row.sql})));

export async function loadEvidence(directory, now = Date.now()) {
  const evidenceManifest = JSON.parse(await readFile(resolve(directory, "manifest.json"), "utf8"));
  const packs = {};
  const entries = [];
  const concepts = new Set();
  const researchFiles = [];
  for (const region of regions) {
    const bytes = await readFile(resolve(directory, `${region}-evidence-pack.json`));
    if (sha256(bytes) !== evidenceManifest.hashes[region]) throw new Error("evidence_pack_hash_mismatch");
    const pack = JSON.parse(bytes.toString());
    if (pack.region !== region || pack.publicationReady.length !== 18 || pack.reserves.length !== 2
      || pack.bundles.length !== 20 || new Set([...pack.publicationReady,...pack.reserves]).size !== 20) throw new Error("evidence_pack_counts");
    const base = `data/question-bank/${draftDirectories[region]}/${draftDirectories[region]}`;
    const originalBytes = await readFile(`${base}-draft-v1.json`);
    const original = JSON.parse(originalBytes.toString());
    researchFiles.push({path:`${base}-draft-v1.json`,sha256:sha256(originalBytes),questions:original.questions.length});
    const csv = parseCsvRows(await readFile(`${base}-cultural-review.csv`, "utf8"));
    const reviews = csv.slice(1).map(row => Object.fromEntries(csv[0].map((name,index)=>[name,row[index]])));
    const originals = new Map(original.questions.map(question => {
      const review = reviews.find(row => row.stableId === question.stableId && Number(row.version) === question.version);
      return [`${question.stableId}@${question.version}`, {sha256:sha256(originalBytes),question,
        specialistReviewRequired: !review || review.specialistReviewRequired !== "no",
        sensitivityNotes:question.sensitivityNotes,communityScope:question.communityScope}];
    }));
    for (const bundle of pack.bundles) {
      await validateEvidenceBundle(bundle, {now,corpusSha256:evidenceManifest.corpusSha256,
        originalDraftReviews:originals,duplicateConceptKeys:concepts});
      concepts.add(bundle.duplicateAnalysis.conceptKey);
    }
    for (const id of pack.publicationReady) {
      const bundle = pack.bundles.find(item => item.question.stableId === id);
      if (!bundle) throw new Error("evidence_id_missing");
      entries.push({region,stableId:id,version:bundle.question.version,questionId:`question_${id}_v${bundle.question.version}`,
        questionContentSha256:canonicalHash(bundle.question),evidenceBundleSha256:bundle.evidenceBundleSha256,
        evidenceFile:`${region}-evidence-pack.json`,evidenceFileSha256:sha256(bytes),
        evidenceReference:`${region}-evidence-pack.json#/bundles/${pack.bundles.indexOf(bundle)}`,
        candidateOrigin:bundle.candidateOrigin,method:bundle.method,policyVersion:bundle.policyVersion,verifiedAt:bundle.verifiedAt,recheckAt:bundle.recheckAt,expiresAt:bundle.expiresAt,
        sources:bundle.sources.map(source => ({id:source.id,url:source.url,locator:source.locator,upstreamIdentity:source.upstreamIdentity,
          sourceRecordSha256:canonicalHash(source)}))});
    }
    packs[region] = pack;
  }
  const seed = await buildDevelopmentSeed();
  if (seed.contentChecksum !== "91ed04fcc134fa53d14a8694eedb04ca7fafb0cbf45c11b07b0d2eff17f8da6a") throw new Error("canonical_seed_mismatch");
  const migrations = await loadMigrationPlan();
  if (migrations.length !== 12) throw new Error("unexpected_migration_count");
  const local=createIsolatedDatabase();let schemaSha256;
  try{applyMigrationPlan(local,migrations);schemaSha256=schemaHash(local.prepare(SCHEMA_QUERY).all());}finally{local.close();}
  const reproductionFiles=[];
  for(const name of (await readdir(directory)).filter(name=> /^(?:west|east|central|north|south)-(?:evidence-pack\.json|report\.md)$|^(?:manifest\.json|rejection-register\.md)$/.test(name)).sort()) {
    reproductionFiles.push({path:name,sha256:sha256(await readFile(resolve(directory,name)))});
  }
  if(reproductionFiles.length!==12)throw new Error("reproduction_file_count");
  const gameDataSha256=sha256(await readFile("app/gameData.ts"));
  if(gameDataSha256!=="3ce3474de2e6b072bf4e893fc2760c8b9ba996a889697ec5ac15f631cc05c74d")throw new Error("game_data_hash_mismatch");
  const manifest = {schemaVersion:"wybp-private-publication-proposal-v1",target:PRIVATE_TEST.databaseName,
    lifecycle:"proposed_not_imported_or_published",method:"machine_evidence_v1",humanCulturalApproval:false,
    canonicalSeedChecksum:seed.contentChecksum,canonicalPerRegion:12,evidencePerRegion:18,eligiblePerRegion:30,
    researchDraftFilesUnchanged:352,researchFiles,selectedOriginalDraftVersions:entries.filter(entry=>entry.candidateOrigin.kind==="original_draft").map(entry=>`${entry.stableId}@${entry.version}`),
    requiresOriginalDraftPublicationDecision:true,excludedReserves:10,reproductionFiles,gameDataSha256,schemaSha256,
    evidenceManifestSha256:sha256(await readFile(resolve(directory,"manifest.json"))),
    migrations:migrations.map(({name,checksum}) => ({name,sha256:checksum})),entries};
  return {packs,manifest,seed};
}

const statement = (sql, params = []) => ({sql,params});
// Deliberately fail the enclosing D1 batch without introducing schema/guard tables.
const guard = (condition, params = []) => statement(`SELECT CASE WHEN (${condition}) THEN 1 ELSE json('catalogue_integrity_failure') END`, params);
function rowGuard(table, row, absentAllowed = false) {
  const columns = Object.keys(row);
  const same = columns.map((column,index) => `${column} IS ?${index+1}`).join(" AND ");
  return guard(`${absentAllowed ? `NOT EXISTS(SELECT 1 FROM ${table} WHERE id=?${columns.indexOf("id")+1}) OR ` : ""}EXISTS(SELECT 1 FROM ${table} WHERE ${same})`,Object.values(row));
}
const insert = (table,row) => statement(`INSERT INTO ${table}(${Object.keys(row).join(",")}) SELECT ${Object.keys(row).map((_,index)=>`?${index+1}`).join(",")} WHERE NOT EXISTS(SELECT 1 FROM ${table} WHERE id=?1)`,Object.values(row));
function canonicalRows(seed) {
  return {editions:seed.editions.map(row=>({id:row.id,edition_key:row.editionKey,name:row.name,region:row.region,version:1,status:"active",created_at:SEED_TIMESTAMP_UTC_MS,updated_at:SEED_TIMESTAMP_UTC_MS})),
    questions:seed.questions.map(row=>({id:row.id,stable_id:row.stableId,version:1,edition_id:row.editionId,category:row.category,
      question_kind:row.questionKind,question_text:row.questionText,answer_options_json:row.answerOptionsJson,correct_answer_json:row.correctAnswerJson,
      explanation:row.explanation,visual_start:row.visualStart,scoring_weight:1,locale:"en",publication_status:"published",source_review_status:"approved",content_hash:row.contentHash,
      country_scope:null,subregion_scope:null,community_scope:null,difficulty:null,accepted_answers_json:"[]",language:"en",sensitivity_notes:null,
      reviewed_by:null,reviewed_at:null,valid_from:null,valid_until:null,image_provenance_json:"[]",audio_provenance_json:"[]",
      published_at:SEED_TIMESTAMP_UTC_MS,retired_at:null,created_at:SEED_TIMESTAMP_UTC_MS,updated_at:SEED_TIMESTAMP_UTC_MS}))};
}
export function seedPlan(seed) {
  const rows = canonicalRows(seed);
  const canonicalIds=rows.questions.map(row=>row.id);
  return [guard(`((SELECT COUNT(*) FROM quiz_editions)=0 AND (SELECT COUNT(*) FROM questions)=0)
    OR ((SELECT COUNT(*) FROM quiz_editions)=5 AND (SELECT COUNT(*) FROM questions)=60 AND (SELECT COUNT(*) FROM questions WHERE id IN (${canonicalIds.map(()=>"?").join(",")}))=60)`,canonicalIds),
    ...rows.editions.map(row=>rowGuard("quiz_editions",row,true)),...rows.questions.map(row=>rowGuard("questions",row,true)),
    ...developmentSeedStatements(seed),...rows.editions.map(row=>rowGuard("quiz_editions",row)),...rows.questions.map(row=>rowGuard("questions",row))];
}
function bundleRows(bundle, entry) {
  const q=bundle.question;
  const time=Date.parse(bundle.verifiedAt);
  const question={id:entry.questionId,stable_id:q.stableId,version:q.version,edition_id:`edition_${q.region}_v1`,
    country_scope:q.countryScope,subregion_scope:q.subregionScope,community_scope:null,category:q.category,difficulty:q.difficulty,
    question_kind:q.questionKind,question_text:q.questionText,answer_options_json:JSON.stringify(q.answerOptions),correct_answer_json:JSON.stringify(q.acceptedAnswers[0]),
    accepted_answers_json:JSON.stringify(q.acceptedAnswers),explanation:q.explanation,visual_start:null,scoring_weight:q.scoringWeight,
    language:q.language,locale:q.locale,publication_status:"draft",source_review_status:"approved",sensitivity_notes:null,reviewed_by:null,reviewed_at:null,
    valid_from:q.validFrom===null?null:Date.parse(q.validFrom),valid_until:q.validUntil===null?null:Date.parse(q.validUntil),
    image_provenance_json:"[]",audio_provenance_json:"[]",content_hash:entry.questionContentSha256,published_at:null,retired_at:null,created_at:time,updated_at:time};
  const evidence={id:`verification_${sha256(`${entry.questionId}|${entry.evidenceBundleSha256}`).slice(0,32)}`,
    question_id:entry.questionId,question_version:q.version,question_content_sha256:entry.questionContentSha256,
    method:bundle.method,status:"verified",risk_class:"low_objective",policy_version:bundle.policyVersion,evidence_bundle_sha256:bundle.evidenceBundleSha256,
    source_count:bundle.sources.length,independent_source_count:new Set(bundle.sources.map(source=>source.upstreamIdentity)).size,
    primary_source_count:bundle.sources.filter(source=>source.role==="primary").length,verified_at:time,recheck_at:Date.parse(bundle.recheckAt),
    expires_at:Date.parse(bundle.expiresAt),created_at:time,updated_at:time,revoked_at:null,revocation_reason:null,deleted_at:null};
  const sources=bundle.sources.map((source,index)=>({id:`source_${sha256(`${entry.questionId}|${index}|${bundle.evidenceBundleSha256}`).slice(0,32)}`,
    question_id:entry.questionId,title:source.title,organisation_or_author:source.institution,url_or_reference:source.url,
    publication_date:null,access_date:source.accessDate,source_type:["peer_reviewed","university"].includes(source.sourceClass)?"academic":["unesco","government_heritage"].includes(source.sourceClass)?"heritage":"primary",review_status:"approved",
    reviewer:null,review_date:null,relevant_claim:source.summary,version:1,created_at:time,updated_at:time}));
  return {question,evidence,sources};
}
export function regionPlan(operation, region, data, now = Date.now()) {
  if (!["import","publish"].includes(operation) || !regions.includes(region)) throw new Error("invalid_catalogue_operation");
  const entries=data.manifest.entries.filter(entry=>entry.region===region);
  const ids=entries.map(entry=>entry.questionId);
  const rows=entries.map(entry=>bundleRows(data.packs[region].bundles.find(bundle=>bundle.question.stableId===entry.stableId),entry));
  const base=canonicalRows(data.seed);
  const count = (table,column) => `(SELECT COUNT(*) FROM ${table} WHERE ${column} IN (${ids.map((_,index)=>`?${index+1}`).join(",")}))`;
  const complete = `${count("questions","id")}=18 AND ${count("question_sources","question_id")}=36 AND ${count("question_evidence_verifications","question_id")}=18`;
  const empty = `${count("questions","id")}=0 AND ${count("question_sources","question_id")}=0 AND ${count("question_evidence_verifications","question_id")}=0`;
  const plan=[...base.editions.map(row=>rowGuard("quiz_editions",row)),...base.questions.map(row=>rowGuard("questions",row)),
    guard(operation==="import"?`(${empty}) OR (${complete})`:complete,ids)];
  for(const row of rows) {
    // Publication is a separate, explicitly approved lifecycle operation. Re-import of published rows is inert.
    const immutable={...row.question};
    delete immutable.publication_status;delete immutable.published_at;delete immutable.updated_at;
    plan.push(rowGuard("questions",immutable,operation==="import"));
    if(operation==="import") {
      plan.push(insert("questions",row.question));
      for(const source of row.sources) plan.push(rowGuard("question_sources",source,true),insert("question_sources",source),rowGuard("question_sources",source));
      plan.push(rowGuard("question_evidence_verifications",row.evidence,true),insert("question_evidence_verifications",row.evidence));
    }
    plan.push(rowGuard("question_evidence_verifications",row.evidence),
      guard(`EXISTS(SELECT 1 FROM question_evidence_verifications WHERE id=?1 AND status='verified' AND recheck_at>?2 AND expires_at>?2)`,[row.evidence.id,now]),
      guard(`EXISTS(SELECT 1 FROM questions WHERE id=?1 AND retired_at IS NULL AND ((publication_status='draft' AND published_at IS NULL) OR (publication_status='published' AND published_at>0 AND published_at<=?2)))`,[row.question.id,now]));
    if(operation==="publish") {
      for(const source of row.sources) plan.push(rowGuard("question_sources",source));
      plan.push(statement(`UPDATE questions SET publication_status='published',published_at=?2,updated_at=?2 WHERE id=?1 AND publication_status='draft'`,[row.question.id,now]));
    }
  }
  plan.push(guard(complete,ids));
  return plan;
}

/** API batch is atomic; no BEGIN/COMMIT SQL or schema changes are sent to D1. */
export async function executeTargetBatch({databaseId,token,plan,migrations,schemaSha256,fetcher=fetch}) {
  validateTestDatabaseId(databaseId);
  if(typeof token!=="string" || !token) throw new Error("operator_token_required");
  const base=`https://api.cloudflare.com/client/v4/accounts/${PRIVATE_TEST.accountId}/d1/database/${databaseId}`;
  const headers={authorization:`Bearer ${token}`,"content-type":"application/json"};
  const response=await fetcher(base,{headers});
  const identity=await response.json();
  if(!response.ok || !identity.success || identity.result?.uuid!==databaseId || identity.result?.name!==PRIVATE_TEST.databaseName) throw new Error("isolated_database_identity_mismatch");
  const query=async batch=>{
    const result=await fetcher(`${base}/query`,{method:"POST",headers,body:JSON.stringify({batch})});
    const body=await result.json();
    if(!result.ok || !body.success || !Array.isArray(body.result) || body.result.length!==batch.length || body.result.some(row=>!row.success)) throw new Error("operator_batch_failed");
    return body.result;
  };
  const ledger=await query([statement("SELECT name FROM d1_migrations ORDER BY id")]);
  if(JSON.stringify(ledger[0].results.map(row=>row.name).sort())!==JSON.stringify(migrations.map(row=>row.name).sort())) throw new Error("migration_ledger_mismatch");
  const schema=await query([statement(SCHEMA_QUERY),statement("PRAGMA foreign_key_check")]);
  if(schemaHash(schema[0].results)!==schemaSha256 || schema[1].results.length)throw new Error("database_schema_or_foreign_key_mismatch");
  return query(plan);
}

async function main() {
  const args=process.argv.slice(2);
  const value=key=>args[args.indexOf(key)+1];
  if(!args.includes("--evidence")) throw new Error("regenerated_evidence_directory_required");
  const data=await loadEvidence(resolve(value("--evidence")));
  const manifestBytes=canonicalEvidenceJson(data.manifest)+"\n";
  if(args.includes("--write-manifest")) {
    if(args.some(arg=>["--apply","--remote"].includes(arg))) throw new Error("manifest_generation_is_local_only");
    await writeFile(publicationManifestPath,manifestBytes);
    console.log(JSON.stringify({manifest:publicationManifestPath,sha256:sha256(manifestBytes),entries:90}));return;
  }
  if(await readFile(publicationManifestPath,"utf8")!==manifestBytes) throw new Error("publication_manifest_mismatch");
  const operation=value("--operation");
  const plan=operation==="seed"?seedPlan(data.seed):regionPlan(operation,value("--region"),data);
  const hash=sha256(manifestBytes);
  if(args.includes("--apply")) {
    if(!args.includes("--remote") || value("--approve-manifest")!==hash || value("--approve-target")!==process.env.WYBP_TEST_D1_DATABASE_ID) throw new Error("explicit_target_and_manifest_approval_required");
    if(operation==="publish"&&value("--region")==="west"&&value("--approve-original-draft")!==data.manifest.selectedOriginalDraftVersions[0])throw new Error("original_research_draft_publication_requires_separate_decision");
    await executeTargetBatch({databaseId:process.env.WYBP_TEST_D1_DATABASE_ID,token:process.env.CLOUDFLARE_API_TOKEN,plan,migrations:data.manifest.migrations,schemaSha256:data.manifest.schemaSha256});
  }
  console.log(JSON.stringify({operation,region:operation==="seed"?null:value("--region"),dryRun:!args.includes("--apply"),statements:plan.length,manifestSha256:hash,target:PRIVATE_TEST.databaseName}));
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) main().catch(error=>{console.error(error.message);process.exitCode=1;});
