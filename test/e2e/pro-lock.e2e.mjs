// Απόδειξη κλειδώματος PRO στο στατικό site: με proLock οι ανοιχτές επιλογές των PRO tipsters δεν υπάρχουν
// ΠΟΥΘΕΝΑ στο dist/ (HTML, JSON API, sitemap, JS). Χωρίς proLock όλα μένουν ανοιχτά όπως πριν.
//   node test/e2e/pro-lock.e2e.mjs        (κάνει δύο builds --offline: ανοιχτό και κλειδωμένο)
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

// οι ανοιχτές (pending) επιλογές του PRO tipster από το αρχείο του, με κομμάτια από την ανάλυσή τους
const md = fs.readFileSync('tipsters/high-fidelity.md', 'utf8').split('\n');
const games = JSON.parse(fs.readFileSync('data/cache.json', 'utf8')).league.games;
const pending = [];
md.forEach((l, i) => {
  const m = /^(\d+)\s*\|\s*([A-Z]{3})-([A-Z]{3})\s*\|/.exec(l);
  if (!m) return;
  const g = games.find(x => x[0] === +m[1] && x[2] === m[2] && x[3] === m[3]);
  if (g && g[6]) return;                                                          // κρίθηκε: δημόσιο (Track Record)
  pending.push({ id: `${m[1]}-${m[2]}-${m[3]}`.toLowerCase(), text: md[i + 1].trim().slice(0, 40) });
});
assert.ok(pending.length, 'χρειάζεται τουλάχιστον μία ανοιχτή επιλογή για τον έλεγχο');
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const scan = () => {
  const hits = [];
  for (const f of walk('dist').filter(f => /\.(html|json|js|xml|txt)$/.test(f))) {
    const s = fs.readFileSync(f, 'utf8');
    for (const p of pending) { if (s.includes(p.text)) hits.push([f, 'ανάλυση ' + p.id]); if (s.includes(`/high-fidelity/${p.id}-`)) hits.push([f, 'σύνδεσμος ' + p.id]); }
  }
  return hits;
};
const build = envx => execFileSync('node', ['build.mjs', '--offline'], { env: { ...process.env, ...envx }, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28 });

build({ PRO_LOCK: '0' });
const open = scan();
assert.ok(open.length > 0, 'χωρίς κλείδωμα οι επιλογές πρέπει να φαίνονται');
assert.ok(!fs.readFileSync('dist/tipsters/index.html', 'utf8').includes('class="prolock"'));
console.log(`  ✓ proLock=false: οι ${pending.length} ανοιχτές επιλογές είναι δημόσιες όπως πριν (${open.length} εμφανίσεις)`);

build({ PRO_LOCK: '1', PRO_API: 'https://pro.example.workers.dev' });
const locked = scan();
assert.deepEqual(locked, [], 'διαρροή PRO επιλογής στο στατικό site');
console.log(`  ✓ proLock=true: καμία ανοιχτή επιλογή σε ${walk('dist').length} αρχεία (HTML, JSON, sitemap, JS)`);
const tip = fs.readFileSync('dist/tipsters/index.html', 'utf8');
assert.ok(tip.includes('class="prolock" data-kind="picks"')); console.log('  ✓ κλειδωμένο κουτί στη σελίδα Tipsters');
const gp = walk('dist/agonas').find(f => f.endsWith('index.html') && fs.readFileSync(f, 'utf8').includes('data-kind="analysis"'));
assert.ok(gp); console.log('  ✓ κουτί «Ανάλυση Αγώνα» στις σελίδες αγώνων');
// οι κριμένες επιλογές μένουν δημόσιες (διαφάνεια)
assert.ok(fs.readFileSync('dist/tipsters/high-fidelity/index.html', 'utf8').includes('10-asv-mun')); console.log('  ✓ οι κριμένες επιλογές μένουν δημόσιες');
console.log('[pro-lock] οκ');
