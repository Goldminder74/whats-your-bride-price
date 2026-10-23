import {readFile,writeFile,mkdir} from "node:fs/promises";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {operatorRetentionPlan,restoreSuppressionPlan,restoreAuthorityPlan} from "../db/retention.ts";
import {executeTargetBatch,SCHEMA_QUERY,schemaHash} from "./private-test-catalogue.mjs";
import {applyMigrationPlan,createIsolatedDatabase,loadMigrationPlan} from "./data-migrations.mjs";

export async function retentionTargetSchema(){
  const plan=await loadMigrationPlan();const db=createIsolatedDatabase();
  try{applyMigrationPlan(db,plan);return {migrations:plan,schemaSha256:schemaHash(db.prepare(SCHEMA_QUERY).all())};}finally{db.close();}
}
export async function main(args=process.argv.slice(2),env=process.env){
  const value=key=>{const i=args.indexOf(key);return i<0?undefined:args[i+1];};
  if(args.includes("--export-suppression")){
    const target=await retentionTargetSchema();const now=Date.now();
    if(!args.includes("--remote"))return {dryRun:true,operation:"export-suppression",schemaSha256:target.schemaSha256};
    if(args.includes("--apply") || value("--approve-target")!==env.WYBP_TEST_D1_DATABASE_ID || !value("--output"))throw new Error("private_export_target_required");
    const directory=resolve("outputs/retention-authority");const output=resolve(value("--output"));
    if(!output.startsWith(directory+"/") && !output.startsWith(directory+"\\"))throw new Error("ignored_private_export_directory_required");
    const results=await executeTargetBatch({databaseId:env.WYBP_TEST_D1_DATABASE_ID,token:env.CLOUDFLARE_API_TOKEN,...target,plan:[
      {sql:"SELECT scope,subject_id subjectId,unavailable_at unavailableAt,forget_after forgetAfter FROM retention_suppression WHERE forget_after>?1 ORDER BY unavailable_at,subject_id LIMIT 101",params:[now]},
      {sql:"SELECT * FROM retention_holds WHERE released_at IS NULL ORDER BY id LIMIT 101",params:[]},
      {sql:"SELECT * FROM retention_cases WHERE closed_at IS NULL OR retain_until>?1 ORDER BY id LIMIT 101",params:[now]},
      {sql:"SELECT * FROM retention_closures WHERE closed_at>?1 ORDER BY closed_at,wallet_id LIMIT 101",params:[now-30*86400000]},
    ]});
    if(results.some(row=>row.results.length>100))throw new Error("private_export_requires_bounded_chunks");
    const body={policy:"retention-v1",databaseId:env.WYBP_TEST_D1_DATABASE_ID,reviewedThrough:now,backupWindowMaxDays:30,
      financialReconciliation:false,holdsReconciled:false,caseAuthorityReconciled:false,
      entries:results[0].results,activeHolds:results[1].results,cases:results[2].results,closures:results[3].results};
    const bytes=Buffer.from(JSON.stringify(body,null,2)+"\n");await mkdir(directory,{recursive:true});await writeFile(output,bytes,{flag:"wx"});
    return {dryRun:false,operation:"export-suppression",reviewRequired:true,sha256:createHash("sha256").update(bytes).digest("hex")};
  }
  const path=value("--action")||value("--restore-manifest");
  if(!path)throw new Error("private_operator_input_required");
  const bytes=await readFile(resolve(path));if(bytes.length>65536)throw new Error("operator_input_too_large");
  const input=JSON.parse(bytes.toString());const receipt=createHash("sha256").update(bytes).digest("hex");const now=Date.now();
  if(!input || typeof input!=="object" || Array.isArray(input))throw new Error("invalid_operator_input");
  let statements;
  if(value("--restore-manifest")){
    if(input.policy!=="retention-v1" || input.financialReconciliation!==true || input.holdsReconciled!==true || input.caseAuthorityReconciled!==true || input.backupWindowMaxDays!==30 || input.databaseId!==env.WYBP_TEST_D1_DATABASE_ID || !Array.isArray(input.entries) || !Number.isSafeInteger(input.reviewedThrough) || input.reviewedThrough>now || now-input.reviewedThrough>900000 || value("--approve-backup-review")!==receipt)throw new Error("external_restore_review_required");
    statements=[...restoreAuthorityPlan(input.activeHolds,input.cases,input.closures,now),...restoreSuppressionPlan(input.entries,receipt,now)];
  }else statements=operatorRetentionPlan(input,now);
  const target=await retentionTargetSchema();
  if(args.includes("--apply")){
    if(!args.includes("--remote") || value("--approve-target")!==env.WYBP_TEST_D1_DATABASE_ID || value("--approve-action")!==receipt)throw new Error("explicit_operator_approval_required");
    await executeTargetBatch({databaseId:env.WYBP_TEST_D1_DATABASE_ID,token:env.CLOUDFLARE_API_TOKEN,plan:statements,migrations:target.migrations,schemaSha256:target.schemaSha256});
  }
  return {dryRun:!args.includes("--apply"),actionSha256:receipt,statements:statements.length,schemaSha256:target.schemaSha256};
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().then(result=>console.log(JSON.stringify(result))).catch(()=>{console.error("Private retention operation rejected; inspect input and target locally. No credentials logged.");process.exitCode=1;});
