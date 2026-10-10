import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp,readFile,writeFile,rm,mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { archiveLaunchEvidence,verifyArchiveDirectory,assertCapturedSourceBody } from "../../scripts/archive-launch-evidence.mjs";
import { sha256 } from "../../scripts/private-test-catalogue.mjs";

test("HTTP 200 bot/error pages cannot masquerade as preserved source PDFs",()=>{
  assert.throws(()=>assertCapturedSourceBody("https://university.invalid/paper.pdf",Buffer.from("<title>Bot Detection</title>")),/pdf_body_invalid/);
  assert.throws(()=>assertCapturedSourceBody("https://university.invalid/article",Buffer.from("<title>Bot Detection</title>")),/challenge_or_error/);
  assert.throws(()=>assertCapturedSourceBody("https://nasa.invalid/photo",Buffer.from("Invalid roll specified")),/challenge_or_error/);
  assert.doesNotThrow(()=>assertCapturedSourceBody("https://publisher.invalid/paper.pdf",Buffer.from("%PDF-1.4 synthetic header check only")));
});

test("self-contained archive reproduces all twelve outputs, lists 180 source records and detects tampering",async()=>{
  const root=await mkdtemp(join(tmpdir(),"wybp-archive-check-"));
  try{
    const evidence=join(root,"evidence"),archive=join(root,"archive");
    await promisify(execFile)(process.execPath,["scripts/build-machine-evidence-question-bank.mjs","--output",evidence],{windowsHide:true});
    const result=await archiveLaunchEvidence({evidence,destination:archive});
    assert.equal(result.questions,90);assert.equal(result.independentBackup,"unverified");assert.equal(result.historicalSourceCaptures,"unverified_not_included");
    assert.equal(JSON.parse(await readFile(join(archive,"source-records.json"),"utf8")).length,180);
    assert.equal(result.currentSourceBodies,0);assert.ok(result.missingCurrentSourceBodies>0);
    assert.ok(!result.files.some(row=>/(?:\.env|node_modules|hosting\.json|netlify-worker)/.test(row.path)));
    const repeat=join(root,"repeat");
    await promisify(execFile)(process.execPath,["scripts/build-machine-evidence-question-bank.mjs","--output",repeat],{cwd:join(archive,"source"),windowsHide:true});
    const manifest=JSON.parse(await readFile(join(archive,"publication-manifest-v1.json"),"utf8"));
    for(const file of manifest.reproductionFiles)assert.equal(sha256(await readFile(join(repeat,file.path))),file.sha256);
    await verifyArchiveDirectory(archive);
    await writeFile(join(archive,"source-records.json"),"tampered");await assert.rejects(verifyArchiveDirectory(archive),/checksum/);
  }finally{await rm(root,{recursive:true,force:true});}
});

test("capture bodies are checksum-bound, never labelled historical, and unlisted archive files fail",async()=>{
  const root=await mkdtemp(join(tmpdir(),"wybp-capture-check-"));
  try{
    const evidence=join(root,"evidence"),cache=join(root,"cache");await mkdir(cache);
    await promisify(execFile)(process.execPath,["scripts/build-machine-evidence-question-bank.mjs","--output",evidence],{windowsHide:true});
    const pack=JSON.parse(await readFile(join(evidence,"west-evidence-pack.json"),"utf8"));
    const url=pack.bundles.find(bundle=>pack.publicationReady.includes(bundle.question.stableId)).sources[0].url;
    const bytes=Buffer.from("Synthetic capture fixture only; never included in the real archive.");
    const row={url,path:"synthetic.body",bytes:bytes.length,sha256:sha256(bytes),capturedAt:new Date().toISOString(),historicalCapture:false,status:"captured_current_http_body"};
    await writeFile(join(cache,row.path),bytes);await writeFile(join(cache,"capture-index.json"),JSON.stringify([row]));
    const archive=join(root,"archive");const result=await archiveLaunchEvidence({evidence,destination:archive,captureCache:cache});assert.equal(result.currentSourceBodies,1);
    await writeFile(join(archive,"unlisted.txt"),"unexpected");await assert.rejects(verifyArchiveDirectory(archive),/unlisted/);
    await writeFile(join(cache,row.path),"tampered");await assert.rejects(archiveLaunchEvidence({evidence,destination:join(root,"bad"),captureCache:cache}),/capture_checksum/);
  }finally{await rm(root,{recursive:true,force:true});}
});
