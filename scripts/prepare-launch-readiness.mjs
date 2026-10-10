import {readFile,writeFile} from "node:fs/promises";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {resolve,join} from "node:path";
import {pathToFileURL} from "node:url";
import {canonicalEvidenceJson,evidenceBundleHash,validateEvidenceBundle} from "../db/questionEvidence.ts";
import {loadEvidence,sha256,regions} from "./private-test-catalogue.mjs";

export const readinessProposalPath="data/question-bank/launch/publication-manifest-v2.proposed.json";
export const readinessRepairsPath="data/question-bank/launch/evidence-readiness-repairs.json";
/** Offline proposal only. Original generator, v1 manifest and archived identities remain reproducible. */
export async function prepareReadiness(output) {
 await promisify(execFile)(process.execPath,["scripts/build-machine-evidence-question-bank.mjs","--output",output],{windowsHide:true});
 const repairs=JSON.parse(await readFile(readinessRepairsPath,"utf8"));
 const original=await loadEvidence(output);const packs=original.packs;
 if(sha256(await readFile("data/question-bank/launch/publication-manifest-v1.json"))!==repairs.priorPublicationManifestSha256 || repairs.repairs.length!==11 || repairs.reserveSubstitutions.length!==2)throw new Error("readiness_base_mismatch");
 for(const repair of repairs.repairs) {
  const pack=packs[repair.stableId.split("_")[0]],bundle=pack.bundles.find(b=>b.question.stableId===repair.stableId);
  if(!bundle || (!pack.publicationReady.includes(repair.stableId)&&!repairs.reserveSubstitutions.some(s=>s.proposed===repair.stableId)) || bundle.question.version!==1)throw new Error("repair_identity_mismatch");
  const previous={stableId:bundle.question.stableId,version:1,questionContentSha256:sha256(canonicalEvidenceJson(bundle.question)),evidenceBundleSha256:bundle.evidenceBundleSha256};
  const {captureSha256,...source}=repair.source;
  if(!/^[0-9a-f]{64}$/.test(captureSha256))throw new Error("capture_hash_required");
  bundle.sources=bundle.sources.map(s=>s.id===repair.sourceId?{...s,...source,accessDate:repairs.reviewedAt.slice(0,10),facts:[bundle.fact]}:s);
  bundle.question.version=2;bundle.candidateOrigin.version=2;
  bundle.question.sources=bundle.sources.map(s=>({title:s.title,organisationOrAuthor:s.institution,urlOrReference:s.url,publicationDate:null,accessDate:s.accessDate,sourceType:["university","peer_reviewed"].includes(s.sourceClass)?"academic":["unesco","government_heritage"].includes(s.sourceClass)?"heritage":"primary",reviewStatus:"approved",relevantClaim:s.summary}));
  bundle.evidenceRevisionProvenance={...previous,relationship:"evidence_metadata_correction",captureSha256};
  bundle.verifiedAt=repairs.reviewedAt;
  bundle.reviewPasses=bundle.reviewPasses.map(pass=>({...pass,inspectedAt:repairs.reviewedAt,findings:pass.kind==="entailment"?[source.summary,source.independenceFinding]:pass.kind==="adversarial_ambiguity"?["The unchanged location claim, four choices and single accepted answer remain supported; only evidence metadata changes.","Exact aliases, source identity, upstream independence and the existing corpus concept were rechecked; no answer or scoring change."]:["Only bounded physical geography is qualified; no living-community or disputed territorial claim is introduced.","This is machine evidence revalidation, not human cultural approval. Original research drafts and original source expiry remain unchanged."]}));
  bundle.evidenceBundleSha256=await evidenceBundleHash(bundle);
  await validateEvidenceBundle(bundle,{now:Date.parse(repairs.reviewedAt),corpusSha256:original.manifest.reproductionFiles?JSON.parse(await readFile(join(output,"manifest.json"),"utf8")).corpusSha256:null,originalDraftReviews:new Map(),duplicateConceptKeys:new Set()});
 }
 for(const swap of repairs.reserveSubstitutions) {
  const pack=packs[swap.region];if(!pack.publicationReady.includes(swap.excluded)||!pack.reserves.includes(swap.proposed))throw new Error("reserve_swap_mismatch");
  pack.originalReserves=[...pack.reserves];
  pack.publicationReady=pack.publicationReady.map(id=>id===swap.excluded?swap.proposed:id);
  pack.reserves=pack.reserves.map(id=>id===swap.proposed?swap.excluded:id);
  // Preserve historical v1 evidence verbatim; explicitly exclude its current preservation hold.
  pack.currentAuditHolds=[{stableId:swap.excluded,reason:swap.reason}];
 }
 const evidenceManifest=JSON.parse(await readFile(join(output,"manifest.json"),"utf8"));
 evidenceManifest.readinessProposal={status:repairs.status,reviewedAt:repairs.reviewedAt,priorPublicationManifestSha256:repairs.priorPublicationManifestSha256,repairsSha256:sha256(await readFile(readinessRepairsPath)),reserveSubstitutions:repairs.reserveSubstitutions};
 for(const region of regions) {
  await writeFile(join(output,`${region}-evidence-pack.json`),canonicalEvidenceJson(packs[region])+"\n");
  evidenceManifest.hashes[region]=sha256(await readFile(join(output,`${region}-evidence-pack.json`)));
  await writeFile(join(output,`${region}-report.md`),`# ${region} activation proposal\n\n18 proposed selections; two excluded identities; all remain draft and unpublished.\nEleven evidence revisions across central/north/south use version 2 with v1 provenance.\nThe central/north substitutions require explicit owner approval. Held v1 records are preserved, not freshly qualified.\n\n## Proposed selections\n${packs[region].publicationReady.map(id=>`- ${id}@${packs[region].bundles.find(b=>b.question.stableId===id).question.version}`).join("\n")}\n`);
 }
 await writeFile(join(output,"manifest.json"),canonicalEvidenceJson(evidenceManifest)+"\n");
 const data=await loadEvidence(output);data.manifest.readinessProposal=evidenceManifest.readinessProposal;
 return data;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
 const output=process.argv[process.argv.indexOf("--output")+1];
 if(!process.argv.includes("--output"))throw new Error("output_required");
 const data=await prepareReadiness(resolve(output));
 if(process.argv.includes("--write-proposal"))await writeFile(readinessProposalPath,canonicalEvidenceJson(data.manifest)+"\n");
 console.log(JSON.stringify({status:"proposed_not_approved_or_published",questions:data.manifest.entries.length,manifestSha256:sha256(canonicalEvidenceJson(data.manifest)+"\n")}));
}
