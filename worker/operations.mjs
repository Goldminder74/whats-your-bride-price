import { WorkerEntrypoint } from 'cloudflare:workers';
import { connect } from 'cloudflare:sockets';
import { configuredAuthorityService, d1AuthorityAdapter, authorityDeliveryTick } from './authorityService.mjs';
import { authoritySnapshot } from './authoritySnapshot.mjs';
import { authorityMail } from './authorityMail.mjs';
import { readBoundary } from '../scripts/authority-runtime.mjs';
import { RETENTION_POLICY, RETENTION_DAY } from '../db/retentionPolicy.ts';
import { driveAccessToken } from './driveOAuth.mjs';
import { encryptRecord, decryptRecord } from '../scripts/recovery-crypto.mjs';

function runtime(env) {
  const alert = authorityMail(env, connect);
  let configured;
  const snapshot = head => authoritySnapshot(d1AuthorityAdapter(env.DB), configured.custody,
    Buffer.from(env.WYBP_AUTHORITY_KEY_BASE64,'base64'))(head);
  configured = configuredAuthorityService(env, { snapshot, alert });
  return { ...configured, alert };
}

// Only private service bindings expose RPC. There is no HTTP management endpoint,
// secret-selected URL, scheduled handler, automatic initialisation or restore bypass.
export class ApplicationAuthority extends WorkerEntrypoint {
  async transact(operationId, statements) {
    try { return await runtime(this.env).service.transact(operationId,statements); }
    catch { throw Error('authority_operation_unavailable'); }
  }
  async readFence() {
    try { return await runtime(this.env).service.readFence(); }
    catch { throw Error('authority_read_unavailable'); }
  }
  fetch() { return new Response('Not found',{status:404}); }
}

export class RecoveryOperator extends ApplicationAuthority {
  async verifyCredentials() {
    let stage='configuration';
    try {
      if (this.env.WYBP_AUTHORITY_ROLE !== 'production-ops') throw Error('role');
      const encoded=this.env.WYBP_AUTHORITY_KEY_BASE64;
      if(typeof encoded!=='string'||!/^[A-Za-z0-9+/]{43}=$/.test(encoded))throw Error('key');
      const key=Buffer.from(encoded,'base64');
      if(key.length!==32||key.toString('base64')!==encoded)throw Error('key');
      const name='credential-check', sample={synthetic:true};
      if(decryptRecord(encryptRecord(sample,key,name),key,name).synthetic!==true)throw Error('encryption');
      const token=driveAccessToken({clientId:this.env.WYBP_DRIVE_CLIENT_ID,clientSecret:this.env.WYBP_DRIVE_CLIENT_SECRET,refreshToken:this.env.WYBP_DRIVE_REFRESH_TOKEN});
      stage='oauth_refresh';
      await token();
      return {oauthRefreshVerified:true,encryptionRoundTripVerified:true};
    } catch(error) {
      const cause=['invalid_grant','invalid_client','unauthorized_client','invalid_scope','provider_rejected'].includes(error.cause)?'_'+error.cause:
        ['drive_oauth_transport','drive_oauth_response','drive_oauth_scope','drive_oauth_configuration'].includes(error.message)?'_'+error.message:'';
      throw Error('credential_verification_failed_'+stage+cause);
    }
  }
  async deliver(boundaryId) {
    try {
      const configured = runtime(this.env);
      return await authorityDeliveryTick(configured.service,boundaryId,
        event => configured.alert({component:event.component,status:event.status,at:Date.now()}));
    } catch { throw Error('authority_delivery_unavailable'); }
  }
  async testAlert() {
    if (this.env.WYBP_TEST_ALERT_APPROVED !== 'true') throw Error('test_alert_not_approved');
    try {
      const configured = runtime(this.env); await configured.service.ready();
      const db = d1AuthorityAdapter(this.env.DB), at=Date.now(), hash='0'.repeat(64);
      const claim=await db.batch([{sql:"INSERT INTO operational_recovery_checkpoints(id,kind,manifest_hash,sequence,head_hash,cursor,state,version,created_at,expires_at) VALUES('test-alert','custody',?1,0,?1,0,'importing',1,?2,?3) ON CONFLICT(id) DO NOTHING RETURNING id",params:[hash,at,at+RETENTION_POLICY.backupDays*RETENTION_DAY]}]);
      if (claim[0].results?.length!==1) throw Error('test_alert_already_claimed');
      const result=await configured.alert({component:'authority',status:'verified',at,test:true});
      await db.batch([{sql:"UPDATE operational_recovery_checkpoints SET state='complete',version=version+1 WHERE id='test-alert' AND state='importing'",params:[]}]);
      return result;
    }
    catch { throw Error('test_alert_unavailable'); }
  }
  async verifyBoundary(id, receipt) {
    try {
      const configured=runtime(this.env);
      const boundary=await readBoundary(configured.custody,Buffer.from(this.env.WYBP_AUTHORITY_KEY_BASE64,'base64'),id,receipt);
      return {verified:true,sequence:boundary.sequence};
    } catch { throw Error('authority_boundary_unavailable'); }
  }
}

export default { fetch() { return new Response('Not found',{status:404}); } };
