import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join,resolve } from "node:path";
const root=resolve(import.meta.dirname,"..");const npmCli=process.env.npm_execpath;if(!npmCli)throw new Error("Run the Prompt 19 suite through npm.");const artifacts=mkdtempSync(join(tmpdir(),"wybp-prompt19-"));
const ordinary={...process.env,PUBLIC_APP_ORIGIN:"https://brideprice.classesforculture.com"};const review={...process.env,PUBLIC_APP_ORIGIN:"http://127.0.0.1:3100",WYBP_FEATURE_FAST_ENTRY:"true",WYBP_FEATURE_FIRST_PARTY_ANALYTICS:"true",WYBP_REVIEW_BUILD:"true",WYBP_REVIEW_ANALYTICS_FIXTURES:"true",WYBP_REVIEW_PRIVACY_FIXTURES:"true",WYBP_PLAYWRIGHT_OUTPUT_DIR:join(artifacts,"results"),WYBP_PLAYWRIGHT_REPORT_DIR:join(artifacts,"report"),WYBP_PRIVACY_VISUAL_DIR:join(artifacts,"visual-review")};
function run(command,args,env=process.env){const result=spawnSync(command,args,{cwd:root,env,stdio:"inherit"});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status??1);}function npm(args,env){run(process.execPath,[npmCli,...args],env);}
run(process.execPath,["--experimental-strip-types","--test","tests/unit/privacyControls.test.mjs","tests/unit/resultPublication.test.mjs","tests/unit/resultService.test.mjs","tests/data/result-publication-repository.test.mjs"]);
npm(["run","build"],ordinary);run(process.execPath,["--test","tests/privacy-rendered-html.test.mjs"],ordinary);
npm(["run","build"],review);run(process.execPath,[resolve(root,"node_modules","@playwright","test","cli.js"),"test","tests/e2e/privacy-controls.spec.ts"],review);
console.log(`Prompt 19 temporary review artefacts: ${artifacts}`);
