import {spawnSync} from "node:child_process";
import {mkdtempSync} from "node:fs";
import {tmpdir} from "node:os";
import {resolve,join} from "node:path";
const root=resolve(import.meta.dirname,"..");const npmCli=process.env.npm_execpath;if(!npmCli)throw new Error("Run through npm.");const artifacts=mkdtempSync(join(tmpdir(),"wybp-cowrie-commerce-"));
function run(args,env=process.env){const result=spawnSync(process.execPath,args,{cwd:root,env,stdio:"inherit"});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status??1);}
run(["--experimental-strip-types","--test","tests/unit/cowrieCommerce.test.mjs","tests/data/cowrie-commerce-migration.test.mjs","tests/data/cowrie-commerce-repository.test.mjs","tests/data/cowrie-frozen-settlement.test.mjs","tests/unit/commerce.test.mjs","tests/data/commerce-migration.test.mjs"]);
const ordinary={...process.env,PUBLIC_APP_ORIGIN:"https://brideprice.classesforculture.com"};run([npmCli,"run","build"],ordinary);run(["--test","tests/cowrie-commerce-rendered-html.test.mjs"],ordinary);
const review={...ordinary,WYBP_FEATURE_COMMERCE:"true",WYBP_FEATURE_RANDOM_QUICK_PLAY:"true",WYBP_FEATURE_COWRIE_ECONOMY:"true",WYBP_REVIEW_BUILD:"true",WYBP_REVIEW_COMMERCE_FIXTURES:"true",WYBP_REVIEW_RANDOM_QUICK_PLAY_FIXTURES:"true",WYBP_REVIEW_COWRIE_FIXTURES:"true",WYBP_PLAYWRIGHT_OUTPUT_DIR:join(artifacts,"results"),WYBP_PLAYWRIGHT_REPORT_DIR:join(artifacts,"report"),WYBP_COWRIE_COMMERCE_EVIDENCE:join(artifacts,"visual-review")};run([npmCli,"run","build"],review);run([resolve(root,"node_modules/@playwright/test/cli.js"),"test","tests/e2e/cowrie-commerce.spec.ts"],review);console.log(`Cowrie commerce temporary review evidence: ${artifacts}`);
