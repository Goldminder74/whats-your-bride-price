import { recoveryHash } from './recovery-crypto.mjs';

/** Fixed, operator-provisioned private folders; no provider resource creation here.
 * The legacy root remains readable. Each inventory record pins its actual folder,
 * so a lost index can be rebuilt without guessing or trusting an archive's scope. */
export class PartitionedDriveCustody {
  constructor(root, partitions, {verifyFolder}={}) {
    const all=[root,...(Array.isArray(partitions)?partitions:[])];
    if(typeof verifyFolder!=='function'||partitions?.length!==16||all.some(c=>!c?.folderId||typeof c.get!=='function'||typeof c.put!=='function'||typeof c.inventoryPages!=='function')
      ||new Set(all.map(c=>c.folderId)).size!==17)throw Error('drive_partition_configuration');
    this.root=root;this.partitions=partitions;this.all=all;this.verifyFolder=verifyFolder;this.checked=new Map();
  }
  async check(custody) {
    if(custody===this.root)return;
    if(!this.checked.has(custody.folderId))this.checked.set(custody.folderId,Promise.resolve().then(()=>this.verifyFolder(custody.folderId,this.root.folderId)));
    if(await this.checked.get(custody.folderId)!==true)throw Error('drive_partition_scope');
  }
  target(name) {this.root.name(name);return this.partitions[parseInt(recoveryHash(Buffer.from(name)).slice(0,2),16)%16];}
  async existing(name) {
    const target=this.target(name),legacy=await this.root.index.get(name),current=await target.index.get(name);
    if(legacy&&current)throw Error('drive_partition_conflict');
    const custody=legacy?this.root:target;await this.check(custody);return custody;
  }
  async get(name) {return (await this.existing(name)).get(name);}
  async put(name,bytes,retention) {return (await this.existing(name)).put(name,bytes,retention);}
  get supportsCommitHead(){return this.root.supportsCommitHead===true;}
  async publishCommitHead(event,head,sourceHead){return this.root.publishCommitHead(event,head,sourceHead);}
  async readLatestCommitHead(){return this.root.readLatestCommitHead();}
  async initialiseCommitHead(record){return this.root.initialiseCommitHead(record);}
  async markCommitted(name,proof){return (await this.existing(name)).markCommitted(name,proof);}
  async readCommit(name){return (await this.existing(name)).readCommit(name);}
  async remove(name) {return (await this.existing(name)).remove(name);}
  async *inventoryPages({maxPages=100,maxFiles=10000}={}) {
    if(!Number.isInteger(maxPages)||maxPages<1||!Number.isInteger(maxFiles)||maxFiles<1)throw Error('drive_inventory_bounds');
    const seen=new Set();let pages=0;
    for(const custody of this.all){await this.check(custody);for await(const page of custody.inventoryPages({maxPages,maxFiles})){
      if(++pages>maxPages||seen.size+page.length>maxFiles)throw Error('drive_inventory_capacity');
      for(const file of page){if(seen.has(file.name))throw Error('drive_partition_conflict');seen.add(file.name);}
      yield page.map(file=>({...file,folderId:custody.folderId}));
    }}
  }
  async list(bounds) {const names=[];for await(const page of this.inventoryPages(bounds))names.push(...page.map(file=>file.name));return names.sort();}
  async inventoryReceipt(bounds) {
    const files=[];
    for await(const page of this.inventoryPages(bounds))for(const file of page){
      const custody=this.all.find(c=>c.folderId===file.folderId),bytes=await custody.get(file.name);
      if(!bytes)throw Error('drive_inventory_gap');
      files.push({...file,sha256:recoveryHash(bytes),...await custody.index.recoveryRecord(file.name)});
    }
    files.sort((a,b)=>a.name.localeCompare(b.name));
    return {files,sha256:recoveryHash(Buffer.from(JSON.stringify(files)))};
  }
  async recoverIndex(files,receipt,fault=()=>{}) {
    if(!Array.isArray(files)||files.length>10000||recoveryHash(Buffer.from(JSON.stringify(files)))!==receipt||new Set(files.map(f=>f.name)).size!==files.length)throw Error('drive_inventory_receipt');
    let count=0;
    for(const file of files){
      const custody=file.folderId?this.all.find(c=>c.folderId===file.folderId):this.root;
      if(!custody||(custody!==this.root&&custody!==this.target(file.name)))throw Error('drive_recovery_scope');
      await this.check(custody);
      const entry={...file};delete entry.folderId;
      // The global receipt was authenticated above; the child still verifies
      // provider metadata, ciphertext, identity and the original retention window.
      await custody.recoverIndex([entry],recoveryHash(Buffer.from(JSON.stringify([entry]))));
      await fault(file,++count);
    }
    return count;
  }
  async cleanupTemporary(now,limit=50) {
    if(!Number.isInteger(limit)||limit<1||limit>50)throw Error('cleanup_bounds');
    let removed=0;for(const custody of this.all){if(removed===limit)break;await this.check(custody);removed+=await custody.cleanupTemporary(now,limit-removed);}return removed;
  }
}
