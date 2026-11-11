// Ταιριάζει το raw-rNN.txt (επίσημες τιμές του EuroLeague Fantasy) με τους κωδικούς παικτών του data/cache.json.
// Χρήση: node fantasy/official/match.mjs 11  → γράφει fantasy/official/prices-r11.csv
import fs from 'node:fs';
const R = process.argv[2];
const TM = { OLY:'OLY', HTA:'HTA', PAO:'PAN', PBB:'PRS', VBC:'PAM', RMB:'MAD', ZAL:'ZAL', VIR:'VIR', DUB:'DUB', BJK:'BES', CZV:'RED', PAR:'PAR', BAR:'BAR', EFS:'IST', MIL:'MIL', ASV:'ASV', MTA:'TEL', FBT:'ULK', KBA:'BAS', BAY:'MUN' };
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z ]/g, ' ').replace(/\b(JR|SR|II|III|IV)\b/g, '').replace(/\s+/g, ' ').trim();
const cache = JSON.parse(fs.readFileSync(new URL('../../data/cache.json', import.meta.url)));
const P = cache.players.map(p => { const [last, first = ''] = p.n.split(','); return { c: p.c, t: p.t, last: norm(last), first: norm(first), n: p.n }; });
const out = [], miss = [];
for (const line of fs.readFileSync(new URL(`./raw-r${R}.txt`, import.meta.url), 'utf8').split('\n').filter(Boolean)) {
  const [name, pos, gt, cr, plus, pop = '', d3 = '', d5 = '', d10 = ''] = line.split('|');   // pop = ποσοστό επιλογής σε ‰· d3/d5/d10 = επίσημη αλλαγή τιμής σε 3/5/10 αγωνιστικές, σε δέκατα (x = δεν υπήρχε)
  const t = TM[gt];
  if (!t) { miss.push(line + '  (άγνωστη ομάδα)'); continue; }
  if (pos === 'HC') { out.push([`COACH-${t}`, cr, plus, name, pop, d3, d5, d10]); continue; }
  const m = name.match(/^(\S+)\.\s+(.+)$/);
  const ini = norm(m[1])[0], last = norm(m[2]);
  const ok = p => p.last === last || p.last.replace(/ /g, '') === last.replace(/ /g, '') || p.last.startsWith(last + ' ') || (p.last.split(' ').includes(last.split(' ')[0]) && last.split(' ').length > 1);
  let c = P.filter(p => ok(p) && p.first[0] === ini);
  if (c.length > 1) c = c.filter(p => p.t === t);
  if (!c.length) c = P.filter(p => ok(p) && p.t === t);   // άλλο μικρό όνομα (π.χ. Olek/Aleksander Balcerowski)
  if (c.length !== 1) { miss.push(`${line}  (${c.length} υποψήφιοι)`); continue; }
  out.push([c[0].c, cr, plus, c[0].n, pop, d3, d5, d10]);
}
fs.writeFileSync(new URL(`./prices-r${R}.csv`, import.meta.url), `# Επίσημες τιμές EuroLeague Fantasy πριν από την ${R}η αγωνιστική: code,price,change,name,pop‰,d3,d5,d10 (δέκατα)\n` + out.map(r => r.map(x => /,/.test(x) ? `"${x}"` : x).join(',')).join('\n') + '\n');
console.log('ok', out.length, 'χωρίς αντιστοίχιση', miss.length); miss.forEach(x => console.log('  ' + x));
