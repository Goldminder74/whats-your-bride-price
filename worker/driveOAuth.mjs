/** Server-only OAuth token source. Caller installs the three credentials as a secret
 * bundle; this module never writes credentials or tokens to disk, logs or responses. */
export function driveAccessToken({ clientId, clientSecret, refreshToken, fetcher = (input, init) => globalThis.fetch(input, init), now = Date.now }) {
  if (![clientId,clientSecret,refreshToken].every(v=>typeof v==='string'&&v.length>8)) throw Error('drive_oauth_configuration');
  let cached, validUntil=0, pending;
  return async () => {
    if(cached&&now()<validUntil)return cached;
    if(pending)return pending;
    pending=(async()=>{
      let response;
      try {response=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:refreshToken,grant_type:'refresh_token'})});}
      catch {throw Error('drive_oauth_transport');}
      if(!response.ok){
        let code='provider_rejected';
        try {const failure=await response.json();if(['invalid_grant','invalid_client','unauthorized_client','invalid_scope'].includes(failure.error))code=failure.error;}catch{/* Never retain provider text. */}
        throw Error('drive_oauth_refresh',{cause:code});
      }
      let result;try{result=await response.json();}catch{throw Error('drive_oauth_response');}
      if (result.scope !== undefined && result.scope !== 'https://www.googleapis.com/auth/drive.file') throw Error('drive_oauth_scope');
      if(typeof result.access_token!=='string'||result.token_type!=='Bearer'||!Number.isFinite(result.expires_in)||result.expires_in<120||result.expires_in>86400)throw Error('drive_oauth_response');
      cached=result.access_token;validUntil=now()+(result.expires_in-60)*1000;return cached;
    })();
    try{return await pending;}finally{pending=undefined;}
  };
}
export function prepareAuthorityAlert({ component, status, at, test = false }) {
  if(component!=='authority'||!['blocked','verified'].includes(status)||!Number.isSafeInteger(at)||typeof test!=='boolean')throw Error('authority_alert');
  // Owner approved the recipient and one labelled test. This remains preparation only;
  // dispatch still requires a securely configured and verified transport.
  return Object.freeze({to:'noreply@classesforculture.com',subject:(test?'[TEST - synthetic data] ':'')+'WYBP authority '+status,body:(test?'TEST ALERT. Synthetic recovery check only. ':'')+'Authority recovery status: '+status+'. UTC: '+new Date(at).toISOString(),sendApproved:false});
}
