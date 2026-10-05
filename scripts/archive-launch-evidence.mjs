import { readFile,writeFile,mkdir,readdir,lstat } from "node:fs/promises";
import { resolve,join,relative,dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { loadEvidence,publicationManifestPath,sha256 } from "./private-test-catalogue.mjs";
import { canonicalEvidenceJson } from "../db/questionEvidence.ts";

const safePath = path => typeof path === "string" && !path.includes("\\") && !path.includes(":") && !path.includes("\0") && !path.startsWith("/")
  && !path.split("/").some(part=>!part||part===".."||part===".");
async function selectedSources(evidence) {
  const data=await loadEvidence(evidence),records=[];
  for(const entry of data.manifest.entries){
    const bundle=data.packs[entry.region].bundles.find(bundle=>bundle.question.stableId===entry.stableId);
    for(const source of bundle.sources)records.push({question:entry.stableId,version:entry.version,evidenceBundleSha256:entry.evidenceBundleSha256,
      sourceRecordSha256:sha256(canonicalEvidenceJson(source)),source});
  }
  if(canonicalEvidenceJson(data.manifest)+"\n"!==await readFile(publicationManifestPath,"utf8"))throw new Error("publication_manifest_mismatch");
  return {data,records,urls:[...new Set(records.map(record=>record.source.url))].sort()};
}

/** Public source bodies only. No cookies, API credentials, business-account operations or qualification changes. */
export async function captureCurrentSources(evidence,cache) {
  const {urls}=await selectedSources(evidence);await mkdir(cache,{recursive:false});
  const index=[];let next=0;
  await Promise.all(Array.from({length:4},async()=>{
    while(next<urls.length){const url=urls[next++],record={url,capturedAt:new Date().toISOString(),historicalCapture:false};
      try{
        const parsed=new URL(url);if(parsed.protocol!=="https:"||parsed.username||parsed.password)throw new Error("unsafe_source_url");
        const response=await fetch(url,{credentials:"omit",redirect:"follow",signal:AbortSignal.timeout(15000)});
        if(new URL(response.url).protocol!=="https:")throw new Error("insecure_source_redirect");
        record.httpStatus=response.status;record.finalUrl=response.url;record.contentType=response.headers.get("content-type");
        if(!response.ok)throw new Error("source_http_unavailable");
        const reader=response.body.getReader(),chunks=[];let size=0;
        for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2*1024*1024){await reader.cancel();throw new Error("source_body_limit");}chunks.push(value);}
        const bytes=Buffer.concat(chunks);if(!bytes.length)throw new Error("source_empty_body");
        record.path=`${sha256(url)}.body`;record.sha256=sha256(bytes);record.bytes=bytes.length;record.status="captured_current_http_body";
        await writeFile(join(cache,record.path),bytes);
      }catch(error){record.status="unavailable";record.failure=error.name==="TimeoutError"?"timeout":error.message==="source_body_limit"?"body_limit":"http_or_transport_unavailable";}
      index.push(record);
    }
  }));
  index.sort((a,b)=>a.url.localeCompare(b.url));await writeFile(join(cache,"capture-index.json"),canonicalEvidenceJson(index)+"\n");
  return {urls:index.length,captured:index.filter(row=>row.status==="captured_current_http_body").length,unavailable:index.filter(row=>row.status!=="captured_current_http_body").length};
}

export async function verifyArchiveDirectory(directory) {
  const manifest=JSON.parse(await readFile(join(directory,"checksums.json"),"utf8"));
  const expected=new Set(["checksums.json"]);
  for(const row of manifest.files){
    if(!safePath(row.path)||expected.has(row.path))throw new Error("unsafe_or_duplicate_archive_path");expected.add(row.path);
    const path=join(directory,row.path);if(!(await lstat(path)).isFile())throw new Error("archive_file_required");
    const bytes=await readFile(path);if(bytes.length!==row.bytes||sha256(bytes)!==row.sha256)throw new Error("archive_checksum_mismatch");
  }
  async function walk(path){for(const item of await readdir(path,{withFileTypes:true})){
    const full=join(path,item.name);if(item.isDirectory())await walk(full);else if(!item.isFile()||!expected.delete(relative(directory,full).replaceAll("\\","/")))throw new Error("archive_unlisted_file");
  }}await walk(directory);if(expected.size)throw new Error("archive_missing_file");
  return manifest;
}

export async function archiveLaunchEvidence({evidence,destination,captureCache}) {
  const {data,records,urls}=await selectedSources(evidence);await mkdir(destination,{recursive:false});
  const files=[];
  async function put(path,bytes){if(!safePath(path))throw new Error("unsafe_archive_path");await mkdir(dirname(join(destination,path)),{recursive:true});await writeFile(join(destination,path),bytes);files.push({path,bytes:bytes.length,sha256:sha256(bytes)});}
  for(const file of data.manifest.reproductionFiles)await put(`evidence/${file.path}`,await readFile(join(evidence,file.path)));
  await put("publication-manifest-v1.json",await readFile(publicationManifestPath));
  await put("source-records.json",Buffer.from(canonicalEvidenceJson(records)+"\n"));
  const tracked=execFileSync("git",["ls-files"],{encoding:"utf8"}).trim().split(/\r?\n/);
  const paths=[...new Set([...tracked,"scripts/archive-launch-evidence.mjs","tests/data/launch-evidence-archive.test.mjs"])].filter(path=>
    /^app\/.*\.tsx?$|^db\/|^data\/question-bank\/(?!launch\/)|^drizzle\/(?:\d.*\.sql|migration-checksums\.json|meta\/_journal\.json)$/.test(path)
    || ["package.json","package-lock.json","tsconfig.json","scripts/build-machine-evidence-question-bank.mjs","scripts/private-test-catalogue.mjs","scripts/data-migrations.mjs","scripts/archive-launch-evidence.mjs","tests/data/launch-evidence-archive.test.mjs",
      "docs/machine-evidence-question-policy.md","docs/retention-schedule.md","docs/netlify-cloudflare-hosting.md"].includes(path)).sort();
  for(const path of paths){if(!safePath(path)||!(await lstat(path)).isFile())throw new Error("source_file_required");await put(`source/${path}`,await readFile(path));}
  const captures=captureCache?JSON.parse(await readFile(join(captureCache,"capture-index.json"),"utf8")):[];
  if(new Set(captures.map(row=>row.url)).size!==captures.length||captures.some(row=>!urls.includes(row.url)))throw new Error("capture_index_invalid");
  const inventory=[];
  for(const url of urls){const row=captures.find(row=>row.url===url)||{url,status:"not_captured",historicalCapture:false};
    if(row.status==="captured_current_http_body"){
      if(!safePath(row.path)||row.historicalCapture!==false||!Number.isFinite(Date.parse(row.capturedAt)))throw new Error("capture_metadata_invalid");
      const bytes=await readFile(join(captureCache,row.path));if(sha256(bytes)!==row.sha256||bytes.length!==row.bytes)throw new Error("capture_checksum_mismatch");
      await put(`source-captures/${row.path}`,bytes);
    }inventory.push(row);
  }
  await put("source-capture-inventory.json",Buffer.from(canonicalEvidenceJson(inventory)+"\n"));
  await put("README.md",Buffer.from("# Proposed launch evidence archive\n\nAll 90 proposed identities, complete structured source records, twelve reproduction outputs, immutable research inputs, policy, migrations and reproduction source are included. No import, publication or human cultural approval occurred.\n\nCurrent HTTP bodies are supplemental snapshots, not proof of historical inspection or fact accuracy. Unavailable sources and historical captures are explicitly inventoried. JavaScript-rendered/linked material may need manual capture. Independent backup remains unverified.\n\nVerify every payload against checksums.json (the checksum file excludes itself); the adjacent ZIP SHA-256 covers the whole container. Reproduce from source/ with Node 24.16 and the committed package lock (dependencies are not vendored), build evidence into a fresh directory outside source/, then compare all twelve output hashes and publication manifest. npm ci may require the package registry; auditing the recorded evidence needs no network.\n\nNever use this archive as evidence that a source was freshly requalified or a question was published. Preserve source expiry and separate hosted approval.\n"));
  const checksum={schemaVersion:"wybp-evidence-archive-v1",sourceCheckpoint:execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),
    sourceCheckpointIsClean:execFileSync("git",["status","--porcelain"],{encoding:"utf8"}).trim()==="",
    createdAt:new Date().toISOString(),publicationManifestSha256:sha256(await readFile(publicationManifestPath)),questions:90,
    historicalSourceCaptures:"unverified_not_included",independentBackup:"unverified",currentSourceBodies:inventory.filter(row=>row.status==="captured_current_http_body").length,
    missingCurrentSourceBodies:inventory.filter(row=>row.status!=="captured_current_http_body").length,files:files.sort((a,b)=>a.path.localeCompare(b.path))};
  await writeFile(join(destination,"checksums.json"),canonicalEvidenceJson(checksum)+"\n");await verifyArchiveDirectory(destination);return checksum;
}

async function main(){const args=process.argv.slice(2),value=key=>args[args.indexOf(key)+1];
  if(!args.includes("--evidence"))throw new Error("evidence_directory_required");
  if(args.includes("--capture-current")){
    if(!args.includes("--capture-cache"))throw new Error("capture_cache_required");console.log(JSON.stringify(await captureCurrentSources(resolve(value("--evidence")),resolve(value("--capture-cache")))));return;
  }
  if(!args.includes("--output"))throw new Error("archive_output_required");
  const result=await archiveLaunchEvidence({evidence:resolve(value("--evidence")),destination:resolve(value("--output")),captureCache:args.includes("--capture-cache")?resolve(value("--capture-cache")):undefined});
  console.log(JSON.stringify({questions:result.questions,files:result.files.length,manifestSha256:result.publicationManifestSha256,currentSourceBodies:result.currentSourceBodies,missingCurrentSourceBodies:result.missingCurrentSourceBodies,independentBackup:result.independentBackup}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
