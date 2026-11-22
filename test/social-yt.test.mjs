// YouTube Shorts (scripts/social-lib.mjs): token, resumable upload, τίτλος, χωρίς δίκτυο
import test from 'node:test';
import assert from 'node:assert/strict';
Object.assign(process.env, { YT_CLIENT_ID: 'cid', YT_CLIENT_SECRET: 'sec', YT_REFRESH_TOKEN: 'rt', YT_PRIVACY: '' });
const calls = [];
globalThis.fetch = async (u, init = {}) => {
  u = String(u); calls.push({ u, init });
  if (u.startsWith('https://oauth2.googleapis.com/token')) return new Response(JSON.stringify({ access_token: 'AT' }));
  if (u.includes('/upload/youtube/v3/videos')) return new Response('', { status: 200, headers: { location: 'https://upload.example/session1' } });
  if (u === 'https://upload.example/session1') return new Response(JSON.stringify({ id: 'vid123', status: { privacyStatus: 'private' } }));
  throw new Error('δίκτυο: ' + u);
};
const { NETS, postTo } = await import('../scripts/social-lib.mjs');

test('YouTube: ενεργό με τα 3 secrets, ανεβαίνει ως Short με σωστό τίτλο και μεταδεδομένα', async () => {
  assert.equal(NETS.yt, true);
  const r = await postTo('yt', { text: '🎯 Όλα τα σουτ του Tyson Carter χθες\n\n31 πόντοι\n\n#EuroLeague #μπάσκετ', short: 'x', ytTitle: 'Όλα τα σουτ του Tyson Carter: 31 πόντοι, 8/14 εντός παιδιάς', videoFile: new URL('../package.json', import.meta.url).pathname });
  assert.deepEqual(r, { id: 'vid123', privacy: 'private' });
  const tok = calls.find(c => c.u.includes('oauth2')), init = calls.find(c => c.u.includes('/upload/youtube/'));
  assert.match(String(tok.init.body), /grant_type=refresh_token/);
  assert.equal(init.init.headers.Authorization, 'Bearer AT');
  const meta = JSON.parse(init.init.body);
  assert.equal(meta.snippet.title, 'Όλα τα σουτ του Tyson Carter: 31 πόντοι, 8/14 εντός παιδιάς #Shorts');
  assert.equal(meta.snippet.categoryId, '17'); assert.equal(meta.status.privacyStatus, 'public'); assert.equal(meta.status.selfDeclaredMadeForKids, false);
  assert.ok(meta.snippet.tags.includes('EuroLeague') && meta.snippet.tags.includes('μπάσκετ'));
  assert.match(meta.snippet.description, /basketballstats\.eu/);
  await assert.rejects(postTo('yt', { text: 'pick', imageFile: null }), /χωρίς βίντεο/);
});
