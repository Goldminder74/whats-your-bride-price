import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test, { after, before } from "node:test";
import { evidenceBundleHash, REVIEW_PASS_GATES, validateEvidenceBundle } from "../../db/questionEvidence.ts";

const execFile = promisify(execFileCallback);
const regions = ["west", "east", "central", "north", "south"];
const regionalFiles = {
  west: "west-africa/west-africa-draft-v1.json",
  east: "east-africa/east-africa-draft-v1.json",
  central: "central-africa/central-africa-draft-v1.json",
  north: "north-africa/north-africa-draft-v1.json",
  south: "southern-africa/southern-africa-draft-v1.json",
};
const protectedHashes = {
  west: "74ad3ce51666c010fb7e82e4f0539f5af8d57b68efb19b1dd0f02c96282c6871",
  east: "51142019e2ee3926c2baca666508b451b017724175a9fbca3206b9000288a2cc",
  central: "4692ddd5c3f2b098da52c7ea4845776df021b1715462fc31225ba6dca8801c13",
  north: "88abc07b04832b530930e422960a90e8bcd88b0b4e49010c1e19c6a9007c17e2",
  south: "2e2964a7412903475173192ef74099ccd1cd41476ad62f2138067e2d6c42faca",
};
const sha256 = value => createHash("sha256").update(value).digest("hex");
let output;
let packs;
let manifest;

before(async () => {
  output = await mkdtemp(join(tmpdir(), "machine-evidence-launch-"));
  await execFile(process.execPath, ["--experimental-strip-types", "scripts/build-machine-evidence-question-bank.mjs", "--output", output], { cwd: new URL("../../", import.meta.url), windowsHide: true });
  packs = Object.fromEntries(await Promise.all(regions.map(async region => [region, JSON.parse(await readFile(join(output, `${region}-evidence-pack.json`), "utf8"))])));
  manifest = JSON.parse(await readFile(join(output, "manifest.json"), "utf8"));
});
after(async () => { if (output) await rm(output, { recursive: true, force: true }); });

test("the deterministic launch bank contains eighteen ready and two reserve drafts per region", async () => {
  assert.deepEqual(manifest.examined, { west: 87, east: 89, central: 102, north: 86, south: 88 });
  assert.deepEqual(manifest.failed, { west: 66, east: 69, central: 82, north: 66, south: 68 });
  assert.deepEqual(manifest.replacementCounts, { west: 20, east: 20, central: 20, north: 20, south: 20 });
  const ids = new Set();
  for (const region of regions) {
    const pack = packs[region];
    assert.equal(pack.region, region);
    assert.equal(pack.bundles.length, 20);
    assert.equal(pack.publicationReady.length, 18);
    assert.equal(pack.reserves.length, 2);
    assert.equal(new Set([...pack.publicationReady, ...pack.reserves]).size, 20);
    for (const bundle of pack.bundles) {
      assert.equal(bundle.question.region, region);
      assert.equal(bundle.question.lifecycleStatus, "draft");
      assert.equal(bundle.question.publishedAt, null);
      assert.equal(bundle.question.reviewer, null);
      assert.equal(bundle.question.reviewDate, null);
      assert.equal(bundle.publicationReadiness, "ready_under_low_risk_policy");
      assert.equal(ids.has(bundle.question.stableId), false);
      ids.add(bundle.question.stableId);
    }
  }
  assert.equal(ids.size, 100);
});

test("every generated bundle has current direct evidence, one primary source and three separate passing reviews", async () => {
  for (const pack of Object.values(packs)) for (const bundle of pack.bundles) {
    assert.ok(bundle.sources.length >= 2);
    assert.ok(bundle.sources.some(source => source.role === "primary"));
    assert.equal(new Set(bundle.sources.map(source => source.institution)).size, bundle.sources.length);
    assert.equal(new Set(bundle.sources.map(source => source.upstreamIdentity)).size, bundle.sources.length);
    assert.ok(bundle.sources.every(source => source.availability === "inspected_accessible" && source.locator && source.summary && source.independenceFinding));
    assert.deepEqual(bundle.reviewPasses.map(pass => pass.kind), ["entailment", "adversarial_ambiguity", "cultural_regional_risk"]);
    for (const pass of bundle.reviewPasses) {
      assert.equal(pass.decision, "pass");
      assert.deepEqual(pass.gates, REVIEW_PASS_GATES[pass.kind]);
    }
    assert.equal(await evidenceBundleHash(bundle), bundle.evidenceBundleSha256);
    await validateEvidenceBundle(bundle, {
      now: Date.parse(manifest.generatedAt),
      corpusSha256: manifest.corpusSha256,
      originalDraftReviews: bundle.draftProvenance
        ? new Map([[`${bundle.draftProvenance.stableId}@1`, { sha256: bundle.draftProvenance.sourceSha256, specialistReviewRequired: false, sensitivityNotes: null, communityScope: null,
          question: JSON.parse(await readFile("data/question-bank/west-africa/west-africa-draft-v1.json","utf8")).questions.find(question=>question.stableId===bundle.draftProvenance.stableId) }]])
        : new Map(),
      duplicateConceptKeys: new Set(),
    });
  }
});

test("the canonical sixty and all 352 source drafts remain byte-exact, draft and unpublished", async () => {
  assert.equal(sha256(await readFile(new URL("../../app/gameData.ts", import.meta.url))), "3ce3474de2e6b072bf4e893fc2760c8b9ba996a889697ec5ac15f631cc05c74d");
  let count = 0;
  for (const region of regions) {
    const bytes = await readFile(new URL(`../../data/question-bank/${regionalFiles[region]}`, import.meta.url));
    assert.equal(sha256(bytes), protectedHashes[region]);
    const source = JSON.parse(bytes);
    count += source.questions.length;
    assert.ok(source.questions.every(question => question.lifecycleStatus === "draft" && question.publishedAt === null));
  }
  assert.equal(count, 352);
});

test("duplicate analysis covers the immutable source corpus and excludes repeated replacement concepts", () => {
  const concepts = [];
  let originalCount = 0;
  for (const pack of Object.values(packs)) for (const bundle of pack.bundles) {
    assert.equal(bundle.duplicateAnalysis.corpusSha256, manifest.corpusSha256);
    assert.equal(bundle.duplicateAnalysis.exactMatches, 0);
    assert.equal(bundle.duplicateAnalysis.nearMatches, bundle.draftProvenance ? 1 : 0);
    concepts.push(bundle.duplicateAnalysis.conceptKey);
    if (bundle.candidateOrigin.kind === "original_draft") originalCount += 1;
  }
  assert.equal(new Set(concepts).size, 100);
  assert.equal(originalCount, 0);
});

test("pack hashes and reports are deterministic and no failed lead enters a pack", async () => {
  const second = await mkdtemp(join(tmpdir(), "machine-evidence-launch-repeat-"));
  try {
    await execFile(process.execPath, ["--experimental-strip-types", "scripts/build-machine-evidence-question-bank.mjs", "--output", second], { cwd: new URL("../../", import.meta.url), windowsHide: true });
    const repeatManifest = JSON.parse(await readFile(join(second, "manifest.json"), "utf8"));
    assert.deepEqual(repeatManifest, manifest);
    for (const region of regions) {
      const first = await readFile(join(output, `${region}-evidence-pack.json`));
      const repeated = await readFile(join(second, `${region}-evidence-pack.json`));
      assert.deepEqual(repeated, first);
      assert.equal(sha256(first), manifest.hashes[region]);
      const report = await readFile(join(output, `${region}-report.md`), "utf8");
      assert.match(report, /Publication-ready: 18/);
      assert.match(report, /Verified reserves: 2/);
      assert.match(report, /Lifecycle: all remain draft and unimported/);
    }
    assert.match(await readFile(join(output, "rejection-register.md"), "utf8"), /No failed lead enters a pack/);
  } finally { await rm(second, { recursive: true, force: true }); }
});

test("the offline builder cannot write inside the repository or contact a database or network", async () => {
  await assert.rejects(execFile(process.execPath, ["--experimental-strip-types", "scripts/build-machine-evidence-question-bank.mjs", "--output", "tests/generated-evidence"], { cwd: new URL("../../", import.meta.url), windowsHide: true }), /evidence_output_must_be_outside_repository/);
  const source = await readFile(new URL("../../scripts/build-machine-evidence-question-bank.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\bfetch\s*\(|\.prepare\s*\(|\bINSERT\s+INTO\b|\bUPDATE\s+questions\b|\bDELETE\s+FROM\b/i);
});

test("Cidade Velha has a distinct hash-bound launch ancestor; original identity and reserves stay excluded",async()=>{
  const city=packs.west.bundles.find(bundle=>bundle.fact.subject==="Cidade Velha");
  assert.equal(city.question.stableId,"west_e_897218520e14659da149e286");
  assert.equal(city.candidateOrigin.kind,"replacement");assert.equal(city.duplicateAnalysis.nearMatches,1);
  assert.equal(city.draftProvenance.stableId,"west_cabo_verde_cidade_velha_island");
  const original=JSON.parse(await readFile("data/question-bank/west-africa/west-africa-draft-v1.json","utf8")).questions.find(question=>question.stableId===city.draftProvenance.stableId);
  assert.equal(original.lifecycleStatus,"draft");assert.equal(original.publishedAt,null);
  const ctx={now:Date.parse(manifest.generatedAt),corpusSha256:manifest.corpusSha256,duplicateConceptKeys:new Set(),originalDraftReviews:new Map([[original.stableId+"@1",{sha256:protectedHashes.west,specialistReviewRequired:false,sensitivityNotes:null,communityScope:null,question:original}]])};
  for(const change of [b=>b.draftProvenance.sourceSha256="0".repeat(64),b=>b.draftProvenance.questionSha256="0".repeat(64),b=>b.draftProvenance.stableId="another_draft",b=>b.question.stableId=original.stableId,b=>b.duplicateAnalysis.nearMatches=2,b=>b.duplicateAnalysis.nearMatches=0,b=>delete b.draftProvenance,b=>{delete b.draftProvenance;b.duplicateAnalysis.nearMatches=0;},b=>b.question.version=2]){
    const altered=structuredClone(city);change(altered);altered.evidenceBundleSha256=await evidenceBundleHash(altered);
    await assert.rejects(validateEvidenceBundle(altered,ctx));
  }
  await assert.rejects(validateEvidenceBundle(city,{...ctx,originalDraftReviews:new Map([[original.stableId+"@1",{...ctx.originalDraftReviews.get(original.stableId+"@1"),specialistReviewRequired:true}]])}));
});

test("all ten previously excluded reserves keep their exact identities",()=>{
  const expected={west:["west_e_f25dee02837d0465284d3952","west_e_fb3704fd227087ca83aa73c5"],east:["east_e_e65fb17485445f2ef404a66c","east_e_e6844633274539f1bd60b372"],central:["central_e_eefe171be0c76dc5c5bd010c","central_e_fcd0ec6a10f83e733277b3e9"],north:["north_e_d94118dd233a0913cdd2b325","north_e_e5eeafc81267f1eec0e6786b"],south:["south_e_df8f235b65a7d0f5efeeb50e","south_e_e6acbbddd05874d001f00987"]};
  for(const region of regions)assert.deepEqual(packs[region].reserves,expected[region]);
});
