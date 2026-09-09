(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SnsCloudStorage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  function create({prefix, storage, request, clientId, digest, onStatus = () => {}}) {
    const memory = new Map();
    const legacyMemory = new Set();
    let migrated = false;
    const jobs = new Map();
    function owned(key) { return key === prefix || key.startsWith(prefix + ':'); }
    function readRaw(key) {
      if (memory.has(key)) return memory.get(key);
      if (migrated) return null;
      try { return storage.getItem(key); } catch { return null; }
    }
    function writeRaw(key, raw) { legacyMemory.delete(key); memory.set(key, raw); }
    function removeRaw(key) { legacyMemory.delete(key); memory.set(key, null); }
    async function archive(key, raw) {
      const hash = await digest(key + '\n' + raw);
      const receipt = await request('archiveBrowserData', {storageKey:key, payload:raw, digest:hash, clientId});
      if (!receipt.verified || receipt.digest !== hash || receipt.systemKey !== 'yokazu7') throw Error('サーバー移行の読戻し確認に失敗しました。');
    }
    async function migrate() {
      // Legacy data is deleted only after durable server read-back verification.
      const keys = [];
      try { for(let i=0;i<storage.length;i++) { const key=storage.key(i); if(key && owned(key) && key !== prefix + ':cloud_client_id') keys.push(key); } }
      catch { throw Error('以前の端末保存を確認できません。移行を停止しました。'); }
      for (const key of keys) {
        const raw = storage.getItem(key);
        if (raw === null) continue;
        if (!memory.has(key) || legacyMemory.has(key)) { memory.set(key, raw); legacyMemory.add(key); }
        await archive(key, raw);
        const current = storage.getItem(key);
        if (current !== null && current !== raw) throw Error('別画面でデータが更新されたため移行を再試行します。');
        storage.removeItem(key);
      }
      migrated = true;
      onStatus();
    }
    function queueArchive(key, raw) {
      const identity = key + '\n' + raw;
      if (jobs.has(identity)) return;
      jobs.set(identity, {key, raw});
      retryArchives();
    }
    let retrying = false;
    async function retryArchives() {
      if (retrying) return;
      retrying = true;
      try { for (const [identity, job] of jobs) { await archive(job.key, job.raw); jobs.delete(identity); } }
      catch { onStatus('復旧データをサーバーへ保存できていません。画面を閉じず、接続回復をお待ちください。'); }
      finally { retrying=false; }
    }
    return {readRaw,writeRaw,removeRaw,migrate,queueArchive,retryArchives,hasPendingArchives:()=>jobs.size>0};
  }
  return {create};
});
