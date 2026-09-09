const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const {create}=require('./cloud-storage.js');
const prefix='sns_operation_report_yokazu7_v4';
const hash=text=>crypto.createHash('sha256').update(text).digest('hex');
function setup(mode='ok') {
 const values=new Map([[prefix,JSON.stringify({text:'既存入力🙂'})],[prefix+':cloud_pending_v2:other','pending'],['other-office','keep']]);
 const archives=[];
 const storage={get length(){return values.size;},key:i=>[...values.keys()][i],getItem:k=>values.get(k)??null,setItem(){throw Error('QuotaExceededError');},removeItem:k=>values.delete(k)};
 const api=create({prefix,storage,clientId:'test',digest:async x=>hash(x),request:async(action,p)=>{
  if(mode==='offline')throw Error('offline');
  assert.equal(action,'archiveBrowserData'); assert.equal(p.digest,hash(p.storageKey+'\n'+p.payload));archives.push(p);
  if(mode==='race')values.set(p.storageKey,'new input');
  return {verified:true,systemKey:'yokazu7',digest:mode==='bad'?'wrong':p.digest};
 }});
 return {api,values,archives};
}
(async()=>{
 const good=setup();await good.api.migrate();assert.equal(good.archives.length,2);assert.deepEqual([...good.values],[['other-office','keep']]);
 good.api.writeRaw(prefix,'new');assert.equal(good.api.readRaw(prefix),'new');assert.equal(good.values.has(prefix),false);
 good.api.removeRaw(prefix);assert.equal(good.api.readRaw(prefix),null);
 for(const mode of ['offline','bad','race']) {const s=setup(mode);await assert.rejects(s.api.migrate());assert.ok(s.values.has(prefix));}
 const offline=setup('offline');offline.api.queueArchive(prefix,'draft');await offline.api.retryArchives();assert.ok(offline.api.hasPendingArchives());
 const live=setup();live.api.queueArchive(prefix,'draft');await new Promise(r=>setImmediate(r));assert.equal(live.api.hasPendingArchives(),false);
 const html=fs.readFileSync('index.html','utf8');for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new Function(m[1]);
 assert.equal(html.includes('localStorage.setItem'),false);assert.equal(html.includes('localStorage.removeItem'),false);
 assert.ok(html.indexOf('await cloudStorage.migrate()')<html.indexOf('const pending = readPendingCloudWrite();',html.indexOf('async function initCloudSync')));
 console.log('cloud storage: full quota, exact migration, offline, tampered receipt, concurrent edits, retries and syntax passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
