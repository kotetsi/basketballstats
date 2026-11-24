import { percentile, fixturesNext } from './stats.mjs';

// Content opportunity score (0–100). It estimates editorial potential from data signals; it is
// NOT a prediction of views. Weights are editable; every component is returned for transparency.

export const WEIGHTS = { significance: 0.22, interest: 0.16, dataQuality: 0.12, originality: 0.14, timeliness: 0.14, fantasy: 0.10, pastPerformance: 0.12 };
const BIG_CLUBS = new Set(['OLY', 'PAN', 'MAD', 'BAR', 'ULK', 'IST', 'ZAL', 'RED', 'PAR', 'TEL']);
const clamp = x => Math.max(0, Math.min(1, x));
const DAY = 864e5;

/** history: [{ format, createdAt, entities:{players,teams} }] from earlier productions/stories */
export function scoreRequest(req, spec, ctx, { history = [], perf = {}, now = ctx.today } = {}) {
  const t = now.getTime();
  const pir = ctx.model.players.filter(p => p.season).map(p => p.season.pir);
  const ent = req.entities || { players: [], teams: [] };
  const star = ent.players.length ? Math.max(...ent.players.map(c => percentile(pir, ctx.model.byCode.get(c)?.season?.pir ?? 0))) / 100 : 0.5;
  const club = ent.teams.some(x => BIG_CLUBS.has(x)) ? 1 : ent.teams.length ? 0.5 : 0.6;
  const interest = clamp(0.5 * star + 0.3 * club + (spec.family === 'interactive' ? 0.2 : 0.1));

  const recentFormat = history.filter(h => h.format === spec.id && t - Date.parse(h.createdAt) < 7 * DAY).length;
  const overlap = history.filter(h => t - Date.parse(h.createdAt) < 14 * DAY && (h.entities?.players || []).some(c => ent.players.includes(c))).length;
  const originality = clamp(1 - 0.45 * recentFormat - 0.25 * overlap);

  let timeliness = spec.evergreen ? 0.5 : 0.6;
  if (spec.gameDay) {
    const next = fixturesNext(ctx)[0];
    const h = next ? (Date.parse(next.t) - t) / 3.6e6 : 999;
    timeliness = h < 30 ? 1 : h < 72 ? 0.7 : 0.3;
  }
  if (req.signals?.timely || spec.id === 'basketball-daily-show') timeliness = Math.max(timeliness, 0.9);

  const fantasy = spec.fantasy ? 1 : ent.players.some(c => ctx.model.byCode.get(c)?.price != null) ? 0.5 : 0.2;
  const pp = perf[spec.id];
  const pastPerformance = pp && pp.published >= 3 && pp.relative != null ? clamp(0.5 * pp.relative) : 0.5; // neutral until there is data

  const comp = { significance: clamp(req.signals?.significance ?? 0.5), interest, dataQuality: clamp(req.signals?.dataQuality ?? 0.8), originality, timeliness, fantasy, pastPerformance };
  const score = Math.round(100 * Object.entries(WEIGHTS).reduce((s, [k, w]) => s + w * comp[k], 0));
  return { score, components: Object.fromEntries(Object.entries(comp).map(([k, v]) => [k, Math.round(v * 100) / 100])), note: 'Estimated editorial potential, not a guarantee of views or engagement.', basis: { recentFormat, overlap, pastPerformance: pp ? `${pp.published} published` : 'no data yet (neutral)' } };
}
