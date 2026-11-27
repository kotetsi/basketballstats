// CLV (closing line value) στα player props της EuroLeague: «θα πόνταρε το μοντέλο σε καλύτερη τιμή από το κλείσιμο;»
//
// Για κάθε (αγώνας, bookmaker, παίκτης, στατιστικό, γραμμή) με τιμή over+under και στο «mid» (~1 μέρα πριν) και στο
// «close» (λίγες ώρες πριν) του OddsPapi (data/odds/props-history.jsonl, μόνο τιμές με seen < τζάμπολ):
//   1. πιθανότητα μοντέλου ΟΠΩΣ ήταν πριν από το mid: κλειδωμένη πρόβλεψη (data/predictions, predicted_at < mid)
//      ή, για αγωνιστικές χωρίς αρχείο, το engine με αγώνες < αγωνιστική (walk-forward)
//   2. επιλογή: η πλευρά με EV ≥ όριο στην τιμή του mid
//   3. CLV = τιμή mid × πιθανότητα κλεισίματος χωρίς γκανιότα − 1 (ίδιο bookmaker, ίδια γραμμή)
//      και «consensus»: μέση πιθανότητα κλεισίματος όλων των bookmakers στην ίδια γραμμή
// Θετικό CLV σε πολλές επιλογές = το μοντέλο βλέπει πριν από την αγορά. Δεν χρειάζεται αποτέλεσμα αγώνα.
//   node scripts/props-clv.mjs [--json data/predictions/props-clv.json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { noVig } from '../src/odds/props.mjs';
import { loadClvRows, clv, bootstrapMean } from '../src/odds/clv-rows.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outArg = process.argv.indexOf('--json'), OUT = outArg > 0 ? process.argv[outArg + 1] : null;
const THR = [0.03, 0.05, 0.08];
const { rows, unmatched, noModel, season } = loadClvRows();

// βάση σύγκρισης: «όλα under» στο mid (αν τα unders απλώς «κλείνουν» χαμηλότερα, το CLV του μοντέλου δεν σημαίνει τίποτα)
const naive = side => { const L = rows.map(r => ({ event: r.event, v: r.mid[side] * (side === 'over' ? r.pcBook : 1 - r.pcBook) - 1, m: side === 'over' ? r.pcBook - noVig(r.mid.over, r.mid.under).over : noVig(r.mid.over, r.mid.under).over - r.pcBook })); return { n: L.length, clv: +(L.reduce((a, x) => a + x.v, 0) / L.length).toFixed(4), ci95: bootstrapMean(L), move: +(L.reduce((a, x) => a + x.m, 0) / L.length).toFixed(4) }; };
const margin = +(rows.reduce((a, r) => a + noVig(r.close.over, r.close.under).margin, 0) / rows.length).toFixed(4);
const report = { generated: new Date().toISOString(), season, method: 'τιμή mid (~1 μέρα πριν) έναντι close (λίγες ώρες πριν), OddsPapi· μοντέλο όπως ήταν πριν από το mid',
  margin_close: margin, counts: { lines: rows.length, games: new Set(rows.map(r => r.event)).size, archive: rows.filter(r => r.src === 'archive').length, unmatched, no_model: noModel },
  naive: { under: naive('under'), over: naive('over') },
  all: Object.fromEntries(THR.map(t => [t, clv(rows, t)])), greek: Object.fromEntries(THR.map(t => [t, clv(rows.filter(r => r.gr), t)])) };
if (OUT) fs.writeFileSync(path.join(ROOT, OUT), JSON.stringify(report, null, 1));
const f = x => x == null ? '–' : (100 * x).toFixed(2) + '%';
console.log(`Props CLV: ${report.counts.lines} γραμμές σε ${report.counts.games} αγώνες (${report.counts.archive} από κλειδωμένο αρχείο)`);
console.log(`  γκανιότα στο κλείσιμο: ${f(margin)} · «όλα under»: CLV ${f(report.naive.under.clv)} κίνηση ${f(report.naive.under.move)} · «όλα over»: CLV ${f(report.naive.over.clv)} κίνηση ${f(report.naive.over.move)}`);
for (const t of THR) { const a = report.all[t], g = report.greek[t];
  console.log(`  EV≥${t * 100}%: ${a.same_book.n} επιλογές, CLV ${f(a.same_book.clv)} ${JSON.stringify(a.same_book.ci95)}, κίνηση προς εμάς ${f(a.same_book.move)} ${JSON.stringify(a.same_book.move_ci95)}, θετικό ${f(a.same_book.positive)}, consensus ${f(a.consensus.clv)} · ελληνικά books ${g.same_book.n}: ${f(g.same_book.clv)} ${JSON.stringify(g.same_book.ci95)}`);
  console.log(`     under ${a.by_side.under?.n || 0}: ${f(a.by_side.under?.clv)} · over ${a.by_side.over?.n || 0}: ${f(a.by_side.over?.clv)} · ${Object.entries(a.by_stat).map(([k, v]) => `${k} ${v.n}: ${f(v.clv)}`).join(' · ')}`); }
