const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('index.html', 'utf8');
const start = html.indexOf('    function pruneConfirmedRecoverySnapshots(');
const end = html.indexOf('    function readPendingCloudWrite(', start);
const confirmed = { posts: [{ id: 'a', impressions: 100 }] };
const unsaved = { posts: [{ id: 'a', impressions: 101 }] };
const values = new Map();
let fail = false;
const context = vm.createContext({
  CLOUD_RECOVERY_KEY: 'recovery', window: { SnsSyncMerge: require('./sync-engine.js') },
  normalizeData: x => x,
  readLocalJson: (key, fallback) => values.has(key) ? JSON.parse(values.get(key)) : fallback,
  cloudStorage: {
    writeRaw(key, value) { if (fail) throw Error('unavailable'); values.set(key, value); },
    removeRaw(key) { if (fail) throw Error('blocked'); values.delete(key); }
  }, updateStorageCapacityWarning() {}
});
vm.runInContext(html.slice(start, end), context);
values.set('pending', JSON.stringify(unsaved));
values.set('other-office', 'preserve');
values.set('recovery', JSON.stringify([{data: confirmed}, {data: unsaved}, {reason:'unknown'}]));
context.pruneConfirmedRecoverySnapshots(confirmed);
assert.deepEqual(JSON.parse(values.get('recovery')), [{data: unsaved}, {reason:'unknown'}]);
assert.equal(values.get('pending'), JSON.stringify(unsaved));
assert.equal(values.get('other-office'), 'preserve');
values.set('recovery', JSON.stringify([{data: confirmed}]));
fail = true;
assert.doesNotThrow(() => context.pruneConfirmedRecoverySnapshots(confirmed));
assert.ok(values.has('recovery'));
fail = false;
context.pruneConfirmedRecoverySnapshots(confirmed);
assert.equal(values.has('recovery'), false);
values.set('recovery', 'malformed');
assert.throws(() => context.pruneConfirmedRecoverySnapshots(confirmed));
// The application readLocalJson catches malformed storage and returns null.
values.set('recovery', 'null');
assert.doesNotThrow(() => context.pruneConfirmedRecoverySnapshots(confirmed));
for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new Function(match[1]);
console.log('Storage cleanup: confirmed-only removal, unsaved/other keys retained, failure and syntax checks passed');
