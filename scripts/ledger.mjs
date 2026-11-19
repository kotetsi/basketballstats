// CI: προσθέτει στο δημόσιο ledger τις νέες προβλέψεις (μετά το predictor/run.py) και ελέγχει την αλυσίδα.
import fs from 'node:fs/promises';
import path from 'node:path';
import { appendEntries, verifyChain, parseLedger } from '../src/odds/ledger.mjs';
import { applyGrRegistry } from '../src/odds/value.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DIR = path.join(ROOT, 'data', 'ledger'), F = path.join(DIR, 'predictions.jsonl');
const rd = async (p, d) => { try { return JSON.parse(await fs.readFile(path.join(ROOT, p), 'utf8')); } catch { return d; } };
const preds = await rd('data/matchups/latest.json', null);
if (!preds) { console.log('ledger: δεν υπάρχουν προβλέψεις'); process.exit(0); }
const reg = await rd('data/odds/bookmakers-gr.json', null);
let odds = await rd('data/odds/latest.json', { games: {} });
if (reg) try { odds = applyGrRegistry(odds, reg) || odds; } catch { }
await fs.mkdir(DIR, { recursive: true });
const lines = parseLedger(await fs.readFile(F, 'utf8').catch(() => ''));
const v0 = verifyChain(lines);
if (!v0.ok) { console.error(`ledger: σπασμένη αλυσίδα στη γραμμή ${v0.bad}, δεν γράφεται τίποτα`); process.exit(1); }
const add = appendEntries(lines, preds, odds, reg, new Date());
if (add.length) await fs.appendFile(F, add.map(e => JSON.stringify(e)).join('\n') + '\n');
const v = verifyChain([...lines, ...add]);
await fs.writeFile(path.join(DIR, 'head.json'), JSON.stringify({ n: v.n, head: v.head, at: new Date().toISOString() }, null, 1) + '\n');
console.log(`ledger: +${add.length} γραμμές, σύνολο ${v.n}, head ${v.head?.slice(0, 12)}`);
