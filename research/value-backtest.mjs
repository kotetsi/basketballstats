// EuroLeague player-prop value research. No sportsbook odds are fabricated.
// Input: JSON array of chronological observations:
// {date, player, market, line, actual, odds, predictedProbability}
// predictedProbability must be generated from information available BEFORE date.
// Usage: node research/value-backtest.mjs observations.json
import fs from 'node:fs';
const file = process.argv[2];
if (!file) { console.error('Usage: node research/value-backtest.mjs observations.json'); process.exit(1); }
const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
if (!Array.isArray(rows)) throw Error('Expected JSON array');
const valid = [];
let excluded = 0;
for (const r of rows) {
  const p = Number(r.predictedProbability), odds = Number(r.odds);
  if (!r.date || !r.player || !r.market || !Number.isFinite(r.actual) ||
      !Number.isFinite(r.line) || !(p > 0 && p < 1) || !(odds > 1)) { excluded++; continue; }
  const over = r.market.toLowerCase().endsWith('over');
  const win = over ? r.actual > r.line : r.actual < r.line;
  const push = r.actual === r.line;
  valid.push({...r, p, odds, win, push, ev: p * odds - 1, stake: p * odds - 1 > 0 ? 1 : 0});
}
const selected = valid.filter(r => r.stake && !r.push);
const n = selected.length;
const profit = selected.reduce((s,r)=>s+(r.win?r.odds-1:-1),0);
const brier = valid.length ? valid.reduce((s,r)=>s+(r.p-(r.win?1:0))**2,0)/valid.length : null;
const output = {inputRows:rows.length, validRows:valid.length, excluded, selected:n,
  wins:selected.filter(r=>r.win).length, losses:selected.filter(r=>!r.win).length,
  profitUnits:profit, roi:n?profit/n:null, brierScore:brier,
  note:'Exploratory only. Historical odds and strictly pregame predictions required. No claim of validated edge.'};
console.log(JSON.stringify(output,null,2));
