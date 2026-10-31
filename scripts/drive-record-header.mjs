import {createHmac,timingSafeEqual} from 'node:crypto';
import {RETENTION_POLICY,RETENTION_DAY} from '../db/retentionPolicy.ts';
const WINDOW=RETENTION_POLICY.backupDays*RETENTION_DAY,ZERO='0'.repeat(64);
const fail=()=>{throw Error('drive_record_header_unavailable');};
const mac=(key,value)=>createHmac('sha256',key).update(JSON.stringify(value)).digest('hex');
const same=(a,b)=>typeof a==='string'&&/^[a-f0-9]{64}$/.test(a)&&timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
function values(identity,record){return ['wybp-drive-record-v1',identity.folderId,identity.fileId,identity.name,record.sha256,record.createdAt,record.expiresAt,record.sequence,record.previousHash,record.eventCreatedAt,record.eventExpiresAt];}
function validate(identity,record){
 if(!Buffer.isBuffer(identity.key)||identity.key.length!==32||![identity.folderId,identity.fileId].every(v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{10,160}$/.test(v))||!/^[a-zA-Z0-9_.-]{1,180}$/.test(identity.name||'')||!/^[a-f0-9]{64}$/.test(record.sha256||''))fail();
 if(![record.createdAt,record.expiresAt,record.eventCreatedAt,record.eventExpiresAt,record.sequence].every(Number.isSafeInteger)||record.createdAt<=0||record.eventCreatedAt<=0||record.expiresAt-record.createdAt!==WINDOW||record.eventExpiresAt-record.eventCreatedAt!==WINDOW||record.sequence<0||!/^[a-f0-9]{64}$/.test(record.previousHash||''))fail();
 if(identity.name.endsWith('.intent')){if(!/^op_\d{13}_[a-f0-9]{32}\.intent$/.test(identity.name)||record.sequence<1)fail();}
 else if(record.sequence!==0||record.previousHash!==ZERO||record.eventCreatedAt!==record.createdAt||record.eventExpiresAt!==record.expiresAt)fail();
}
/** Minimal authenticated metadata; never includes event SQL, identities or money.
 * Each property key+value stays below Drive's124-byte per-property limit. */
export function createDriveRecordHeader(identity,{sha256,createdAt,expiresAt,event=null}){
 const record={sha256,createdAt,expiresAt,sequence:event?.sequence??0,previousHash:event?.previousHash??ZERO,eventCreatedAt:event?.createdAt??createdAt,eventExpiresAt:event?.expiresAt??expiresAt};validate(identity,record);
 return {wybpRecovery:'1',wybpRecordVersion:'1',wybpCipherSha256:sha256,wybpCreatedAt:String(createdAt),wybpExpiresAt:String(expiresAt),wybpSequence:String(record.sequence),wybpPreviousHash:record.previousHash,wybpEventCreatedAt:String(record.eventCreatedAt),wybpEventExpiresAt:String(record.eventExpiresAt),wybpRecordProof:mac(identity.key,values(identity,record))};
}
export function verifyDriveRecordHeader(identity,properties){
 if(!properties||!Object.keys(properties).some(k=>k.startsWith('wybp')&&k!=='wybpRecovery'&&k!=='wybpCommitProof'))return null;
 if(properties.wybpRecovery!=='1'||properties.wybpRecordVersion!=='1')fail();
 const numeric=k=>{const value=properties[k];if(typeof value!=='string'||!/^(0|[1-9]\d{0,15})$/.test(value))fail();return Number(value);};
 const record={sha256:properties.wybpCipherSha256,createdAt:numeric('wybpCreatedAt'),expiresAt:numeric('wybpExpiresAt'),sequence:numeric('wybpSequence'),previousHash:properties.wybpPreviousHash,eventCreatedAt:numeric('wybpEventCreatedAt'),eventExpiresAt:numeric('wybpEventExpiresAt')};validate(identity,record);
 if(!same(properties.wybpRecordProof,mac(identity.key,values(identity,record))))fail();return record;
}
export function verifyDriveCommitHeader(key,name,record,proof){return same(proof,mac(key,['wybp-commit-v1',name,record.sha256,record.eventCreatedAt,record.eventExpiresAt]));}
