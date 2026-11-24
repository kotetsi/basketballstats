import fs from 'node:fs';
import path from 'node:path';
import { VL_ROOT, availability, isEnabled } from './engine.mjs';
import { loadProductions, performanceByFormat, perfIndex } from './analytics.mjs';

// Editorial calendar: recommends formats per day. It never publishes or renders by itself.
// Rules: game days → previews and Fantasy picks; the morning after → recap; the day before a
// round → Fantasy market; no games → evergreen (history, discovery, quizzes); weekly shows;
// no format twice within its cool-down; manual entries from calendar.json always shown.

export const WEEKLY_SHOWS = {
  1: { show: 'Fantasy Monday', formats: ['basketball-stock-market', 'underrated-player'] },
  4: { show: 'Stat Thursday', formats: ['numbers-dont-lie', 'statistical-twin', 'efficiency-trap'] },
  6: { show: 'Throwback Saturday', formats: ['basketball-time-machine', 'one-season-in-60-seconds'] },
  0: { show: 'Sunday Quiz', formats: ['basketball-iq-test', 'guess-the-player', 'rank-these-players', 'data-challenge'] },
};
const COOLDOWN_DAYS = { default: 6, 'basketball-daily-show': 0, 'matchup-lab': 0, 'who-would-you-pick': 2 };
const athens = d => d.toLocaleDateString('en-CA', { timeZone: 'Europe/Athens' });
const PLAN_FILE = path.join(VL_ROOT, 'calendar.json');

export function loadPlan(file = PLAN_FILE) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { entries: [] }; } }
export function addPlanEntry(entry, file = PLAN_FILE) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date || '')) throw new Error('date must be YYYY-MM-DD');
  const plan = loadPlan(file);
  plan.entries.push({ id: Math.random().toString(36).slice(2, 9), date: entry.date, formatId: entry.formatId, note: String(entry.note || '').slice(0, 300), createdAt: new Date().toISOString() });
  fs.writeFileSync(file, JSON.stringify(plan, null, 2) + '\n');
  return plan;
}
export function removePlanEntry(id, file = PLAN_FILE) { const p = loadPlan(file); p.entries = p.entries.filter(e => e.id !== id); fs.writeFileSync(file, JSON.stringify(p, null, 2) + '\n'); return p; }

export async function buildCalendar(ctx, formats, { days = 14, start = ctx.today, settings = { enabled: {} }, productionsDir, planFile = PLAN_FILE, perDay = 2 } = {}) {
  const av = Object.fromEntries(formats.map(s => [s.id, availability(ctx, s, settings)]));
  const usable = formats.filter(s => av[s.id].status === 'available' && isEnabled(s, settings));
  const byId = Object.fromEntries(formats.map(s => [s.id, s]));
  const perf = productionsDir ? perfIndex(performanceByFormat(productionsDir, formats)) : {};
  const past = productionsDir ? loadProductions(productionsDir).filter(p => p.format).map(p => ({ format: p.format, day: athens(new Date(p.createdAt)) })) : [];
  const gameDays = new Map();
  for (const fx of ctx.fixtures().filter(x => x.comp === 'E')) { const d = athens(new Date(fx.t)); (gameDays.get(d) || gameDays.set(d, []).get(d)).push(fx); }
  const plan = loadPlan(planFile).entries;
  const lastUsed = {};
  for (const p of past) lastUsed[p.format] = lastUsed[p.format] && lastUsed[p.format] > p.day ? lastUsed[p.format] : p.day;
  const out = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * 864e5), day = athens(d), dow = new Date(`${day}T12:00:00Z`).getUTCDay();
    const prev = athens(new Date(d.getTime() - 864e5)), next = athens(new Date(d.getTime() + 864e5));
    const gToday = gameDays.get(day) || [], gYesterday = gameDays.get(prev) || [], gTomorrow = gameDays.get(next) || [];
    const wanted = [];
    const add = (id, reason, priority, show) => { if (byId[id] && usable.some(s => s.id === id)) wanted.push({ formatId: id, reason, priority, show }); };
    if (gToday.length) { add('matchup-lab', `${gToday.length} EuroLeague game(s) today`, 0.95); add('who-would-you-pick', 'Fantasy decisions before tip-off', 0.8); }
    if (gYesterday.length && !gToday.length) add('basketball-daily-show', 'the morning after game day', 0.95);
    if (gYesterday.length && gToday.length) add('basketball-daily-show', 'results from last night', 0.85);
    if (gTomorrow.length && !gToday.length) { add('basketball-stock-market', 'Fantasy deadline tomorrow', 0.85); add('underrated-player', 'value picks before the round', 0.75); }
    const W = WEEKLY_SHOWS[dow];
    if (W) W.formats.forEach((id, k) => add(id, `weekly show: ${W.show}`, 0.7 - k * 0.05, W.show));
    const reserved = new Set(Object.values(WEEKLY_SHOWS).flatMap(w => w.formats)); // keep show formats for their show day
    if (!gToday.length && !gYesterday.length) for (const s of usable.filter(s => s.evergreen || ['discovery', 'interactive', 'statistical'].includes(s.family))) add(s.id, s.evergreen ? 'no games: evergreen content' : 'no games: discovery/analysis', (s.evergreen ? 0.6 : 0.5) - (reserved.has(s.id) ? 0.2 : 0));
    // performance prior and anti-repetition
    const daysSince = id => (lastUsed[id] ? Math.round((Date.parse(day) - Date.parse(lastUsed[id])) / 864e5) : 99);
    const scored = wanted.map(w => ({ ...w, priority: Math.round(100 * (w.priority + (perf[w.formatId]?.relative ? (perf[w.formatId].relative - 1) * 0.1 : 0))) / 100 }))
      .filter(w => daysSince(w.formatId) >= (COOLDOWN_DAYS[w.formatId] ?? COOLDOWN_DAYS.default))
      .sort((a, b) => b.priority - a.priority);
    const seen = new Set(), slots = [];
    for (const w of scored) { if (seen.has(w.formatId) || slots.length >= perDay) continue; seen.add(w.formatId); slots.push({ ...w, name: byId[w.formatId].name, family: byId[w.formatId].family }); lastUsed[w.formatId] = day; }
    const manual = plan.filter(e => e.date === day).map(e => ({ formatId: e.formatId, name: byId[e.formatId]?.name || e.formatId, reason: e.note || 'manual plan', manual: true, planId: e.id, status: av[e.formatId]?.status || 'unknown' }));
    out.push({ date: day, weekday: new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }), gameDay: gToday.length > 0, games: gToday.map(g => `${g.h}-${g.a}`), show: W?.show || null, slots: [...manual, ...slots] });
  }
  return { generatedAt: new Date().toISOString(), days: out, note: 'Recommendations only. Nothing is produced or published automatically.' };
}
