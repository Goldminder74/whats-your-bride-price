import { WorkerEntrypoint } from 'cloudflare:workers';
import { connect } from 'cloudflare:sockets';
import { configuredAuthorityService, d1AuthorityAdapter, authorityDeliveryTick } from './authorityService.mjs';
import { authoritySnapshot, assertEmptyOperationalSource } from './authoritySnapshot.mjs';
import { authorityMail } from './authorityMail.mjs';
import { readBoundary } from '../scripts/authority-runtime.mjs';
import { RETENTION_POLICY, RETENTION_DAY } from '../db/retentionPolicy.ts';
import { driveAccessToken } from './driveOAuth.mjs';
import { encryptRecord, decryptRecord, recoveryHash } from '../scripts/recovery-crypto.mjs';
import { D1DriveIndex } from '../scripts/d1-drive-index.mjs';
import { DriveCustody } from '../scripts/drive-custody.mjs';
import { D1Authority } from '../scripts/authority-runtime.mjs';
import { restoreSuppressionPlan } from '../db/retention.ts';
import { hostedSyntheticRecovery } from './hostedSyntheticRecovery.mjs';

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
  async hostedSynthetic(action,payload) {
    if(this.env.WYBP_HOSTED_REHEARSAL_ENABLED!=='true')throw Error('hosted_synthetic_recovery_disabled');
    try {
      const configured=runtime(this.env);configured.custody.pageSize=2;
      const recovery=hostedSyntheticRecovery({env:this.env,db:d1AuthorityAdapter(this.env.DB),custody:configured.custody,index:configured.index,key:Buffer.from(this.env.WYBP_AUTHORITY_KEY_BASE64,'base64')});
      switch(action){
        case 'stage':return await recovery.stage(payload);
        case 'step':return await recovery.step(payload);
        case 'finish':return await recovery.finish(payload?.cleanup===true);
        case 'protection':return await recovery.verifyProtection();
        case 'empty-receipt':return await recovery.restoreEmptyReceipt();
        case 'inventory':return await recovery.inventory();
        case 'recover-inventory':return await recovery.recoverInventory(payload.files,payload.receipt,payload.interrupt===true);
        default:throw Error('scope');
      }
    }catch(error){throw Error(/^hosted_inventory_(receipt|head|loss_transaction|recover|verify|complete)_(type|reference|binding|constraint|other|batch_shape|query_shape|authorization|database)$/.test(error.message)?error.message:'hosted_synthetic_recovery_blocked');}
  }
  async reconstructSyntheticIndex(files,receipt) {
    try {
      if(this.env.WYBP_AUTHORITY_ROLE!=='production-ops'||receipt!==this.env.WYBP_SYNTHETIC_RECOVERY_RECEIPT||!Array.isArray(files)||files.length!==1||files[0].name!=='synthetic-commissioning-v1.enc')throw Error('scope');
      const configured=runtime(this.env);await configured.service.ready();
      if(recoveryHash(Buffer.from(JSON.stringify(files)))!==receipt)throw Error('receipt');
      const file=files[0],row=await configured.index.row(file.name);
      if(row&&(row.fileId!==file.id||row.created_at!==file.createdAt||row.expires_at!==file.expiresAt))throw Error('conflict');
      // Only this explicitly synthetic mapping is removed. Encrypted Drive bytes,
      // financial authority, real mappings and the primary key remain untouched.
      if(row)await d1AuthorityAdapter(this.env.DB).batch([{sql:'DELETE FROM operational_recovery_checkpoints WHERE id=?1 AND manifest_hash=?2',params:[row.id,row.manifest_hash]}]);
      await configured.custody.recoverIndex(files,receipt);
      const after=await configured.index.row(file.name),bytes=await configured.custody.get(file.name);
      if(!bytes||recoveryHash(bytes)!==file.sha256||decryptRecord(bytes,Buffer.from(this.env.WYBP_AUTHORITY_KEY_BASE64,'base64'),file.name).synthetic!==true)throw Error('readback');
      return {verified:true,originalIdPreserved:after.fileId===file.id,originalExpiryPreserved:after.created_at===file.createdAt&&after.expires_at===file.expiresAt};
    }catch{throw Error('synthetic_index_recovery_failed');}
  }
  async verifyIndependentKeyCopy() {
    try {
      const encoded=this.env.WYBP_RECOVERY_KEY_CHECK_BASE64;
      if(typeof encoded!=='string'||!/^[A-Za-z0-9+/]{43}=$/.test(encoded))throw Error('candidate');
      const key=Buffer.from(encoded,'base64');if(key.length!==32||key.toString('base64')!==encoded)throw Error('candidate');
      const configured=runtime(this.env),name='synthetic-commissioning-v1.enc',bytes=await configured.custody.get(name);
      if(!bytes)throw Error('archive');const value=decryptRecord(bytes,key,name);
      if(value.synthetic!==true||value.purpose!=='credential-and-custody-verification')throw Error('archive');
      return {syntheticArchiveDecryptionVerified:true,custodyIndependence:'owner_confirmation_required'};
    }catch{throw Error('independent_key_verification_failed');}
  }
  async commissionEmptyBaseline() {
    try {
      const db=d1AuthorityAdapter(this.env.DB);
      await assertEmptyOperationalSource(db);
      const proof=await this.verifySyntheticBackup();
      const index=new D1DriveIndex(db,proof.folderId),accessToken=driveAccessToken({clientId:this.env.WYBP_DRIVE_CLIENT_ID,clientSecret:this.env.WYBP_DRIVE_CLIENT_SECRET,refreshToken:this.env.WYBP_DRIVE_REFRESH_TOKEN});
      const custody=new DriveCustody({folderId:proof.folderId,index,accessToken}),key=Buffer.from(this.env.WYBP_AUTHORITY_KEY_BASE64,'base64');
      const authority=new D1Authority(db,custody,key),id='commissioning-empty-baseline-v1';
      const head=await authority.initialise();if(head.sequence!==0||head.head_hash!=='0'.repeat(64))throw Error('authority_present');
      const {receipt}=await authority.deliver(id,authoritySnapshot(db,custody,key));
      const prior=await db.query("SELECT receipt_hash FROM retention_restore WHERE id='active'");
      if(prior.length&&prior[0].receipt_hash!==receipt)throw Error('receipt_conflict');
      if(!prior.length)await db.batch(restoreSuppressionPlan([],receipt,Date.now()));
      return {verified:true,receipt,folderId:proof.folderId,sequence:0,scope:'empty-database-only',applicationRecoveryVerified:false};
    }catch{throw Error('empty_baseline_verification_failed');}
  }
  // Credential/custody commissioning only: never creates a runtime-access receipt.
  async verifySyntheticBackup() {
    try {
      await this.verifyCredentials();
      if(this.env.WYBP_AUTHORITY_DATABASE_NAME!=='wybp-prod-d1-r001')throw Error('target');
      const db=d1AuthorityAdapter(this.env.DB);
      if((await db.query('SELECT COUNT(*) n FROM schema_migrations'))[0]?.n!==14)throw Error('schema');
      const accessToken=driveAccessToken({clientId:this.env.WYBP_DRIVE_CLIENT_ID,clientSecret:this.env.WYBP_DRIVE_CLIENT_SECRET,refreshToken:this.env.WYBP_DRIVE_REFRESH_TOKEN});
      const request=async(url,options={})=>{
        const response=await globalThis.fetch(url,{...options,redirect:'manual',headers:{...options.headers,Authorization:'Bearer '+await accessToken()}});
        if(!response.ok&&response.status!==409)throw Error('provider');return response;
      };
      const root=new D1DriveIndex(db,'wybp_recovery_root');
      let folderId=await root.get('production-recovery-folder');
      if(!folderId){const response=await request('https://www.googleapis.com/drive/v3/files/generateIds?count=1&space=drive&type=files');folderId=await root.reserve('production-recovery-folder',(await response.json()).ids?.[0]);}
      const metadataUrl='https://www.googleapis.com/drive/v3/files/'+folderId+'?fields=id,name,mimeType,trashed,permissions(type,role)';
      let metadata=await globalThis.fetch(metadataUrl,{redirect:'manual',headers:{Authorization:'Bearer '+await accessToken()}});
      if(metadata.status===404){await request('https://www.googleapis.com/drive/v3/files?fields=id',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:folderId,name:'WYBP Production Recovery',mimeType:'application/vnd.google-apps.folder',appProperties:{wybpRecoveryFolder:'1'}})});metadata=await request(metadataUrl);}
      if(!metadata.ok)throw Error('folder');const folder=await metadata.json();
      if(folder.id!==folderId||folder.name!=='WYBP Production Recovery'||folder.mimeType!=='application/vnd.google-apps.folder'||folder.trashed||!Array.isArray(folder.permissions)||folder.permissions.length!==1||folder.permissions[0].type!=='user'||folder.permissions[0].role!=='owner')throw Error('folder_privacy');
      const index=new D1DriveIndex(db,folderId),custody=new DriveCustody({folderId,index,accessToken}),key=Buffer.from(this.env.WYBP_AUTHORITY_KEY_BASE64,'base64');
      const name='synthetic-commissioning-v1.enc',payload={version:1,synthetic:true,purpose:'credential-and-custody-verification'};
      const bytes=await custody.get(name)||encryptRecord(payload,key,name);
      if(JSON.stringify(decryptRecord(bytes,key,name))!==JSON.stringify(payload))throw Error('payload');
      const sha256=await custody.put(name,bytes),downloaded=await custody.get(name);
      if(!downloaded||JSON.stringify(decryptRecord(downloaded,key,name))!==JSON.stringify(payload))throw Error('readback');
      const files=[{name,id:await index.get(name),sha256,...await index.recoveryRecord(name)}];
      const receipt=recoveryHash(Buffer.from(JSON.stringify(files)));
      await new DriveCustody({folderId,index:new D1DriveIndex(db,folderId),accessToken}).recoverIndex(files,receipt);
      return {verified:true,folderId,fileId:files[0].id,sha256,inventoryReceipt:receipt,indexRecoveryVerified:true,runtimeAccess:'blocked_pending_recovery_baseline'};
    }catch{throw Error('synthetic_custody_verification_failed');}
  }
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
