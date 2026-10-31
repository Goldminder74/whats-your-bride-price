import {createHmac,timingSafeEqual} from 'node:crypto';
import {RETENTION_POLICY,RETENTION_DAY} from '../db/retentionPolicy.ts';
const WINDOW=RETENTION_POLICY.backupDays*RETENTION_DAY,fail=()=>{throw Error('drive_commit_head_unavailable');};
const proof=(key,folderId,r)=>createHmac('sha256',key).update(JSON.stringify(['wybp-drive-head-v1',folderId,r.sequence,r.head,r.createdAt,r.expiresAt])).digest('hex');
function check(key,r){if(!Buffer.isBuffer(key)||key.length!==32||!Number.isSafeInteger(r.sequence)||r.sequence<1||!/^[a-f0-9]{64}$/.test(r.head||'')||!Number.isSafeInteger(r.createdAt)||!Number.isSafeInteger(r.expiresAt)||r.createdAt<1||r.expiresAt-r.createdAt!==WINDOW)fail();}
export function encodeCommitHead(key,folderId,record){check(key,record);return {wybpHeadVersion:'1',wybpHeadSequence:String(record.sequence),wybpHeadHash:record.head,wybpHeadCreatedAt:String(record.createdAt),wybpHeadExpiresAt:String(record.expiresAt),wybpHeadProof:proof(key,folderId,record)};}
export function decodeCommitHead(key,folderId,properties={}){
 if(!Object.keys(properties).some(k=>k.startsWith('wybpHead')))return null;if(properties.wybpHeadVersion!=='1')fail();
 for(const field of ['wybpHeadSequence','wybpHeadCreatedAt','wybpHeadExpiresAt'])if(typeof properties[field]!=='string'||!/^[1-9]\d{0,15}$/.test(properties[field]))fail();
 const record={sequence:Number(properties.wybpHeadSequence),head:properties.wybpHeadHash,createdAt:Number(properties.wybpHeadCreatedAt),expiresAt:Number(properties.wybpHeadExpiresAt)};check(key,record);
 if(!/^[a-f0-9]{64}$/.test(properties.wybpHeadProof||'')||!timingSafeEqual(Buffer.from(properties.wybpHeadProof,'hex'),Buffer.from(proof(key,folderId,record),'hex')))fail();return record;
}
