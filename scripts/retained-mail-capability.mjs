// Offline package policy. This marker is not a hosted grant or send authority.
export const SYNTHETIC_MAIL_APPROVAL='owner-approved-2026-10-26';
export function retainedServices(syntheticMail=false){
 const services=[['RETAINED_AUTHORITY','RetainedAuthority'],['RETAINED_OPERATOR','RetainedOperator'],['RETAINED_JOB_RUNNER','RetainedJobRunner'],['RETAINED_APPLICATION',undefined]].map(([binding,entrypoint])=>({binding,service:'wybp-capacity-worker-r002',...(entrypoint?{entrypoint}:{})}));
 if(syntheticMail)services.push({binding:'RETAINED_CONFIRMATION_MAIL',service:'wybp-prod-ops-r001',entrypoint:'SyntheticConfirmationMail'});
 return services;
}
export function assertRetainedServices(services,approval){
 if(approval!==undefined&&approval!==SYNTHETIC_MAIL_APPROVAL)throw Error('retained_release_unavailable');
 const expected=retainedServices(approval===SYNTHETIC_MAIL_APPROVAL);
 if(!Array.isArray(services)||services.length!==expected.length||new Set(services.map(s=>s?.binding)).size!==expected.length)throw Error('retained_release_unavailable');
 for(const service of services){const wanted=expected.find(s=>s.binding===service?.binding);if(!wanted||Object.keys(service).sort().join()!==Object.keys(wanted).sort().join()||Object.keys(wanted).some(k=>service[k]!==wanted[k]))throw Error('retained_release_unavailable');}
}
