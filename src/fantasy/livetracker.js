// Fantasy Live Tracker (browser): επίσημο live feed της EuroLeague + τελικά του build, σύνθεση από το Fantasy Manager.
import { liveScore, turnTimeline, recommendations, simulateRemaining, liveAlerts, roundReview, currentTurn } from './live.mjs';
import { enumerateLineups } from './turns.mjs';
import { solve } from './solver.mjs';
import { lineupOf } from './manager.mjs';

const X = JSON.parse(document.getElementById('livectx').textContent), L = X.L;
const app = document.getElementById('liveApp');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const f1 = v => (v == null || isNaN(v) ? '–' : (+v).toFixed(1));
const sg = v => (v == null ? '–' : `<span class="${v > 0 ? 'up' : v < 0 ? 'dn' : ''}">${v > 0 ? '+' : ''}${(+v).toFixed(1)}</span>`);
const FEED = 'https://feeds.incrowdsports.com/provider/euroleague-feeds/v2/competitions/E/seasons/' + X.season + '/games';
let RD, PJ, P, players, timer = null, lastFetch = null, feedErr = false;
const LIVE = { games: {}, box: {} };

const loadS = () => { try { return JSON.parse(localStorage.getItem('fmt-v1')); } catch { return null; } };
const saveS = S => { try { localStorage.setItem('fmt-v1', JSON.stringify(S)); } catch { } };
const tm = t => esc(X.teams[t] || t), nm = c => esc(P.get(c)?.dn || c);

async function init() {
  [RD, PJ] = await Promise.all([fetch(X.roundApi, { cache: 'no-cache' }).then(r => r.json()), fetch(X.projApi, { cache: 'no-cache' }).then(r => r.json()).catch(() => null)]);
  // παίκτες: projections της τρέχουσας αγωνιστικής· για παλιές αγωνιστικές η εκτίμηση εκείνης της αγωνιστικής (backfill), αν υπάρχει
  const base = PJ?.players || [];
  const pastPP = RD.proj || null;
  players = base.map(p => {
    const day = RD.teamDay?.[p.t] ?? null, g = RD.games.find(x => x.h === p.t || x.a === p.t);
    const q = { ...p, day, opp: g ? (g.h === p.t ? g.a : g.h) : null };
    if (!X.current) { const pp = pastPP?.[p.c]; Object.assign(q, pp != null ? { pp, p50: pp, p10: pp * 0.45, p90: pp * 1.6, pwin: 0.5, status: 'playing' } : { pp: 0, p50: 0, p10: 0, p90: 0, status: 'playing' }); }
    return q;
  });
  // παίκτες χωρίς τρέχουσα εκτίμηση (η ομάδα τους έπαιξε ήδη, ή δεν είναι πια στο ρόστερ): εκτίμηση εκείνης της αγωνιστικής αν υπάρχει, αλλιώς κενή (0)
  const have = new Set(players.map(p => p.c));
  for (const [c, n, t, pos, s, pp, price] of RD.extra || []) if (!have.has(c)) {
    const g = RD.games.find(x => x.h === t || x.a === t);
    players.push({ c, dn: n, t, pos, u: X.pbase + s + '/', price, pp: pp ?? 0, p50: pp ?? 0, p10: (pp ?? 0) * 0.45, p90: (pp ?? 0) * 1.6, pwin: 0.5, status: 'playing', day: RD.teamDay?.[t] ?? null, opp: g ? (g.h === t ? g.a : g.h) : null, noProj: pp == null });
  }
  P = new Map(players.map(p => [p.c, p]));
  // τελικά του build
  for (const [c, b] of Object.entries(RD.box || {})) LIVE.box[c] = { min: b[0], pir: b[1], pts: b[2], reb: b[3], ast: b[4], stl: b[5], blk: b[6], tov: b[7], fgm2: b[8], fga2: b[9], fgm3: b[10], fga3: b[11], ftm: b[12], fta: b[13], pf: b[14] };
  for (const g of RD.games) setGame(g.h, g.a, g.played ? 'final' : 'scheduled', g.hs, g.as, 1, g.id, g.day);
  render();
  if (X.current) poll();
}
function setGame(h, a, state, hs, as, frac, id, day, extra = {}) {
  LIVE.games[h] = { state, margin: (hs ?? 0) - (as ?? 0), home: true, hs, as, frac, id, day, opp: a, ...extra };
  LIVE.games[a] = { state, margin: (as ?? 0) - (hs ?? 0), home: false, hs, as, frac, id, day, opp: h, ...extra };
}

async function poll() {
  clearTimeout(timer);
  const now = Date.now();
  const active = RD.games.filter(g => !g.played && now > Date.parse(g.t) - 15 * 60e3 && now < Date.parse(g.t) + 4 * 3600e3);
  try {
    if (active.length) {
      let codes = null;
      try { codes = JSON.parse(sessionStorage.getItem('bsLiveCodes') || 'null'); } catch { }
      if (!codes) { const j = await fetch(FEED + '?limit=500', { cache: 'no-store' }).then(r => r.json()); codes = {}; (j.data || []).forEach(x => { codes[x.round.round + '|' + x.home.code + '|' + x.away.code] = x.code; }); try { sessionStorage.setItem('bsLiveCodes', JSON.stringify(codes)); } catch { } }
      await Promise.all(active.map(async g => {
        const code = codes[X.round + '|' + g.h + '|' + g.a]; if (code == null) return;
        const x = (await fetch(FEED + '/' + code, { cache: 'no-store' }).then(r => r.json())).data; if (!x) return;
        const st = x.status === 'result' ? 'final' : (Date.now() >= Date.parse(g.t) && ((x.home?.score || 0) + (x.away?.score || 0) > 0 || !/confirm|schedul/i.test(x.status || ''))) ? 'live' : 'scheduled';
        const q = +x.quarter || 0, rem = String(x.remainingTime || '10:00').split(':').map(Number), left = (rem[0] || 0) * 60 + (rem[1] || 0);
        const frac = st === 'final' ? 1 : st === 'live' ? Math.min(1, ((Math.min(q, 4) - 1) * 600 + (600 - left)) / 2400) : 0;
        setGame(g.h, g.a, st, x.home?.score, x.away?.score, frac, g.id, g.day, { q, rem: x.remainingTime, ot: q > 4 });
        if (st !== 'scheduled') {
          const s = await fetch(FEED + '/' + code + '/stats', { cache: 'no-store' }).then(r => r.json());
          for (const side of [s.local, s.road]) for (const pl of side?.players || []) {
            const c = pl.player?.person?.code, v = pl.stats; if (!c || !v) continue;
            LIVE.box[c] = { min: (v.timePlayed || 0) / 60, pir: v.valuation || 0, pts: v.points || 0, reb: v.totalRebounds || 0, ast: v.assistances || 0, stl: v.steals || 0, blk: v.blocksFavour || 0, tov: v.turnovers || 0, fgm2: v.fieldGoalsMade2 || 0, fga2: v.fieldGoalsAttempted2 || 0, fgm3: v.fieldGoalsMade3 || 0, fga3: v.fieldGoalsAttempted3 || 0, ftm: v.freeThrowsMade || 0, fta: v.freeThrowsAttempted || 0, pf: v.foulsCommited || 0 };
          }
        }
      }));
      feedErr = false; lastFetch = new Date();
    }
  } catch (e) { feedErr = true; console.warn('[live] feed', e); }
  render();
  const anyLive = Object.values(LIVE.games).some(g => g.state === 'live');
  timer = setTimeout(poll, anyLive ? 30e3 : active.length ? 60e3 : 5 * 60e3);
}

function lineupNow() {
  const S = loadS(), t = S?.teams?.[S.active];
  if (!t || t.roster?.length !== 10) return { t: null };
  const lv = t.live?.[X.round];
  if (lv?.start?.length === 5) return { t, S, lu: { ...lv, coach: lv.coach ?? t.coach } };
  const ro = t.roster.map(c => P.get(c)).filter(Boolean);
  if (ro.length !== 10) return { t, S, lu: null };
  const lu = lineupOf(ro, 'ceiling', t.formation || 'auto');
  if (t.captain && lu.start.includes(t.captain)) lu.captain = t.captain;
  return { t, S, lu: { ...lu, coach: t.coach } };
}

function card(r) {
  const p = P.get(r.c), b = r.stats, cls = r.state === 'not_started' || r.state === 'no_game' ? 'gray' : r.state === 'injured' || r.state === 'dnp' ? 'bad' : r.pir >= (p.pp || 0) ? 'good' : 'bad';
  const st = `<span class="lst lst-${r.state}">${esc(L.st[r.state])}${r.state === 'playing' ? ' <i class="ldot"></i>' : ''}</span>`;
  const g = LIVE.games[p.t];
  const score = g && g.state !== 'scheduled' ? `${tm(p.t)} ${g.home ? g.hs : g.as} – ${g.home ? g.as : g.hs} ${tm(g.opp)}` : g ? `${g.home ? 'vs' : '@'} ${tm(g.opp)} · ${esc(X.days[g.day] || '')}` : '';
  const warn = r.state === 'dnp' || r.state === 'injured' ? `<p class="lwarn">⚠ ${esc(L.warnOut)}</p>` : r.state === 'playing' && g?.frac > 0.5 && r.min < 5 && r.slot !== 'bench' ? `<p class="lwarn">⚠ ${esc(L.warnMin)}</p>` : '';
  return `<div class="lcard ${cls}"><div class="lch"><b>${r.captain ? '<span class="capb">C</span> ' : ''}${r.slot === 'bench' ? '<span class="benb">B</span> ' : r.slot === 'sixth' ? '<span class="benb">6</span> ' : ''}<a href="${p.u || X.base + p.s + '/'}">${esc(p.dn)}</a></b>${st}</div>
<p class="sub">${tm(p.t)} · ${esc(L.pos[p.pos])} · ${score}</p>
<div class="lnums"><div><span title="${esc(L.tip.pir)}">PIR</span><b>${r.state === 'not_started' ? '–' : r.pir}</b></div><div><span>${esc(L.minL)}</span><b>${r.state === 'not_started' ? '–' : Math.round(r.min)}</b></div><div><span title="${esc(L.tip.proj)}">${esc(L.projL)}</span><b>${p.noProj ? '–' : f1(p.pp)}</b></div><div><span title="${esc(L.tip.fp)}">${esc(L.fpL)}</span><b>${f1(r.show)}</b>${r.state === 'not_started' ? '<small>proj.</small>' : ''}</div><div><span>Δ PIR</span><b>${r.diffPIR == null ? '–' : sg(r.diffPIR)}</b></div></div>
${b && r.state !== 'not_started' ? `<p class="lstats">${b.pts} ${esc(L.s.pts)} · ${b.reb} ${esc(L.s.reb)} · ${b.ast} ${esc(L.s.ast)} · ${b.stl} ${esc(L.s.stl)} · ${b.blk} ${esc(L.s.blk)} · ${b.tov} ${esc(L.s.tov)} · FG ${b.fgm2 + b.fgm3}/${b.fga2 + b.fga3} · 3PT ${b.fgm3}/${b.fga3} · FT ${b.ftm}/${b.fta} · PF ${b.pf}</p>` : ''}${warn}</div>`;
}

function render() {
  const { t, S, lu } = lineupNow();
  if (!t) { app.innerHTML = `<p class="fmwarn">${esc(L.noTeam)} <a href="${X.manager}">Fantasy Manager →</a></p>`; return; }
  if (!lu) { app.innerHTML = `<p class="fmwarn">${esc(L.noLineup)}</p>`; return; }
  const games = LIVE.games, box = LIVE.box;
  const Sc = liveScore(lu, players, PJ?.coaches || [], games, box);
  const cur = currentTurn(RD.days, games), finished = cur >= RD.days.length;
  // αρχική εκτίμηση: η εκτίμηση της ίδιας σύνθεσης με όλους τους αγώνες «δεν ξεκίνησε» (εκτιμήσεις πριν από τον γύρο).
  // Αν ο χρήστης είχε ανοίξει τη σελίδα πριν από τον πρώτο αγώνα, κρατάμε εκείνη τη φωτογραφία.
  const preG = Object.fromEntries(Object.entries(games).map(([k, g]) => [k, { ...g, state: 'scheduled', frac: 0 }]));
  const preTot = liveScore(lu, players, PJ?.coaches || [], preG, {}).updated;
  t.rounds = t.rounds || {};
  const started = Object.values(games).some(g => g.state !== 'scheduled');
  if (X.current && !started && !t.rounds[X.round]) { t.rounds[X.round] = { projected: preTot, ts: Date.now(), lineup: lu }; saveS(S); }
  const snap = t.rounds[X.round];
  const init0 = snap && JSON.stringify(snap.lineup) === JSON.stringify(lu) ? snap.projected : (X.current || RD.proj ? preTot : null);
  const sim = !finished && X.current ? simulateRemaining(lu, players, PJ?.coaches || [], games, box, init0) : null;
  const TL = turnTimeline(lu, players, PJ?.coaches || [], games, box, RD.days);
  const REC = !finished ? recommendations(lu, players, PJ?.coaches || [], games, box, RD.days) : null;
  const AL = liveAlerts(lu, players, PJ?.coaches || [], games, box, RD.days, { initial: init0 });
  const anyLive = Object.values(games).some(g => g.state === 'live');
  const done = RD.days.length ? TL.filter(x => x.state === 'done').length : 0;
  const prog = TL.map(x => `<div class="ltp ${x.state}" title="Turn ${x.turn + 1} · ${esc(x.date)}"><span>T${x.turn + 1}</span><i style="width:${x.state === 'done' ? 100 : x.state === 'live' ? 50 : 0}%"></i></div>`).join('');
  const sb = `<section class="lsb"><div class="lsbm"><span>${anyLive ? '<b class="livep"><i class="ldot"></i> LIVE</b> ' : finished ? `<b class="finp">${esc(L.final)}</b> ` : ''}${esc(L.round)} ${X.round}</span>
<div class="lbig"><b>${f1(Sc.actual)}</b><small>${esc(L.actualL)}</small></div><div class="lbig"><b>${f1(init0)}</b><small title="${esc(L.tip.init)}">${esc(L.initL)}</small></div><div class="lbig"><b>${f1(Sc.updated)}</b><small title="${esc(L.tip.upd)}">${esc(L.updL)}</small></div><div class="lbig"><b>${init0 == null ? '–' : sg(Sc.updated - init0)}</b><small>${esc(L.diffL)}</small></div></div>
<div class="ltps">${prog}</div>
<p class="sub">${esc(L.groups)}: ${esc(L.slot.start)} ${f1(Sc.byGroup.start)} · ${esc(L.slot.captain)} ${f1(Sc.byGroup.captain)} · ${esc(L.slot.sixth)} ${f1(Sc.byGroup.sixth)} · ${esc(L.slot.bench)} ${f1(Sc.byGroup.bench)} · ${esc(L.coach)} ${Sc.coach ? (Sc.coach.state === 'final' ? f1(Sc.coach.actual) : esc(L.coachPending) + ' (' + f1(Sc.coach.projected) + ')') : '–'}${lastFetch ? ' · ' + esc(L.updated) + ' ' + lastFetch.toLocaleTimeString(X.loc, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}${feedErr ? ' · ⚠ ' + esc(L.feedErr) : ''}</p></section>`;
  const projC = sim ? `<section><h2>${esc(L.projH)}</h2><div class="lproj">${(() => { const lo = Math.min(sim.p5, init0 ?? sim.p5, Sc.actual) - 5, hi = Math.max(sim.p95, init0 ?? 0) + 5, x = v => ((100 * (v - lo)) / (hi - lo)).toFixed(1); return `<div class="lpbar"><i class="rng" style="left:${x(sim.p5)}%;width:${x(sim.p95) - x(sim.p5)}%"></i><i class="mk med" style="left:${x(sim.p50)}%" title="P50"></i>${init0 != null ? `<i class="mk ini" style="left:${x(init0)}%" title="${esc(L.initL)}"></i>` : ''}<i class="mk act" style="left:${x(Sc.actual)}%" title="${esc(L.actualL)}"></i></div>`; })()}
<ul class="fmkpi"><li>${esc(L.worst)} (P5) <b>${f1(sim.p5)}</b></li><li>${esc(L.likely)} (P50) <b>${f1(sim.p50)}</b></li><li>${esc(L.bestT)} (P95) <b>${f1(sim.p95)}</b></li><li>${esc(L.remL)} <b>${f1(Sc.remaining)}</b></li>${sim.pBeat != null ? `<li>${esc(L.pBeat)} <b>${Math.round(100 * sim.pBeat)}%</b></li>` : ''}${sim.keyMiss ? `<li>${esc(L.keyMiss.replace('{p}', P.get(sim.keyMiss.c)?.dn || ''))} <b>${sg(sim.keyMiss.impact)}</b></li>` : ''}</ul></div></section>` : '';
  const cards = `<section><h2>${esc(L.playersH)}</h2><div class="lcards">${Sc.rows.map(card).join('')}${Sc.coach ? `<div class="lcard ${Sc.coach.state === 'final' ? (Sc.coach.actual > 0 ? 'good' : 'bad') : 'gray'}"><div class="lch"><b>🧑‍💼 ${tm(Sc.coach.t)}</b><span class="lst lst-${Sc.coach.state === 'final' ? 'finished' : Sc.coach.state === 'live' ? 'playing' : 'not_started'}">${esc(L.gst[Sc.coach.state])}</span></div><p class="sub">${esc(L.coach)} · ${esc(L.coachRule)}</p><div class="lnums"><div><span>${esc(L.fpL)}</span><b>${Sc.coach.state === 'final' ? f1(Sc.coach.actual) : '–'}</b></div><div><span>${esc(L.estL)}</span><b>${f1(Sc.coach.projected)}</b></div><div><span>${esc(L.marginL)}</span><b>${Sc.coach.margin == null || Sc.coach.state === 'scheduled' ? '–' : sg(Sc.coach.margin)}</b></div></div></div>` : ''}</div></section>`;
  const tl = `<section><h2>${esc(L.turnsH)}</h2><div class="fmtimeline">${TL.map(x => `<div class="fmturn ${x.state === 'live' ? 'current' : x.state}"><h3>Turn ${x.turn + 1} · ${esc(X.days[x.turn] || x.date)} <small>${esc(L.ts[x.state])}</small></h3><p class="sub">${x.games.map(g => `${tm(g.t)}–${tm(g.opp)}${g.state !== 'scheduled' ? ' ' + g.hs + '-' + g.as : ''}`).join(' · ')}</p>
<p>${esc(L.plays)}: ${x.players.map(nm).join(', ') || '–'}</p><p class="sub">${esc(L.playedB)}: ${x.playedBefore.map(nm).join(', ') || '–'}</p><p class="sub">${esc(L.availL)}: ${x.available.map(nm).join(', ') || '–'}</p><p>© ${nm(x.captain)} · ${esc(L.bestCap)}: ${x.bestCaptain ? nm(x.bestCaptain) : '–'}</p><p><b>${f1(x.points)}</b> ${esc(L.ptsSoFar)} · ${f1(x.remaining)} ${esc(L.remShort)}</p></div>`).join('')}</div></section>`;
  const recH = REC ? `<section><h2>Live Recommendations</h2>${REC.list.length ? `<ul class="lrec">${REC.list.map(x => `<li><b>${esc(L.rk[x.k])}</b>: ${x.k === 'captain' ? esc(L.rcap.replace('{a}', P.get(x.out)?.dn || '').replace('{b}', P.get(x.in)?.dn || '')) : esc(L.rswap.replace('{a}', P.get(x.out)?.dn || '').replace('{b}', P.get(x.in)?.dn || ''))}${x.formation ? ' ' + esc(L.rform.replace('{f}', x.formation)) : ''} <span class="sub">· ${esc(L.impact)} ${sg(x.impact)} · ${esc(L.riskL)} ${esc(L.lvl[x.risk])} · ${esc(L.confL)} ${esc(L.lvl[x.confidence])}</span><br><small>${esc(L.rwhy[x.why] || '')}</small></li>`).join('')}</ul><p>${esc(L.bestRem.replace('{a}', f1(REC.current)).replace('{b}', f1(REC.bestRemaining)))}</p>` : `<p class="sub">${esc(L.noRec)}</p>`}</section>` : '';
  const alH = `<section><h2>${esc(L.alertsH)} <small>${AL.length}</small></h2><ul class="fmalerts">${AL.map(a => `<li class="sev-${a.severity}"><span class="sev">${esc(L.sev[a.severity])}</span><div><b>${a.c ? nm(a.c) : a.game ? esc(L.gameDone) : ''}</b><p>${esc(L.al[a.k] || a.k)}${a.impact != null ? ' · ' + esc(L.impact) + ' ' + f1(a.impact) : ''}</p><p class="sub">${esc(L.act[a.action] || '')} · ${new Date(a.ts).toLocaleTimeString(X.loc, { hour: '2-digit', minute: '2-digit' })}</p></div></li>`).join('') || `<li>${esc(L.noAlerts)}</li>`}</ul></section>`;
  let rv = '';
  if (finished) {
    const pool = players.filter(p => p.opp);
    const actPool = pool.map(p => ({ ...p, pp: box[p.c]?.pir ?? 0, p50: box[p.c]?.pir ?? 0, p10: box[p.c]?.pir ?? 0, p90: box[p.c]?.pir ?? 0, pwin: (games[p.t]?.margin ?? 0) > 0 ? 1 : 0, status: 'playing' }));
    const R = roundReview(lu, players, PJ?.coaches || [], games, box, { initial: init0, enumerate: ro => enumerateLineups(ro, P), solveBest: () => { const s = solve(actPool, (PJ?.coaches || []).map(c => ({ ...c, exp: games[c.t]?.state === 'final' ? (games[c.t].margin > 0 ? (games[c.t].margin <= 10 ? 10 : games[c.t].margin <= 20 ? 20 : 25) : (-games[c.t].margin <= 10 ? -5 : -games[c.t].margin <= 20 ? -10 : -20)) : 0, p50: 0, p90: 0, p10: 0 })), { mode: 'expected', timeLimitMs: 3000 }); return s.start ? { lineup: s, points: s.objective } : null; } });
    rv = `<section class="lreview"><h2>${esc(L.reviewH)}</h2><ul class="fmkpi"><li>${esc(L.finalL)} <b>${f1(R.final)}</b></li><li>${esc(L.initL)} <b>${f1(R.initial)}</b></li><li>${esc(L.diffL)} <b>${sg(R.diff)}</b></li></ul>
<p>⭐ ${esc(L.bestP)}: <b>${nm(R.best.c)}</b> (${sg(R.best.over)}) · 👎 ${esc(L.worstP)}: <b>${nm(R.worst.c)}</b> (${sg(R.worst.over)})</p>
<p>© ${esc(L.capPerf.replace('{p}', P.get(R.captain.c)?.dn || '').replace('{x}', f1(R.captain.points)))}${R.captain.missed > 0 ? ' ' + esc(L.capMiss.replace('{p}', P.get(R.captain.ideal)?.dn || '').replace('{x}', f1(R.captain.missed))) : ''}</p>
<p>${esc(L.benchPerf.replace('{x}', f1(R.bench.points)))} · ${esc(L.coach)}: ${R.coach ? f1(R.coach.actual) : '–'}</p>
${R.bestArrangement ? `<p>${esc(L.bestArr.replace('{x}', f1(R.bestArrangement.points)).replace('{m}', f1(R.bestArrangement.missed)))} (© ${nm(R.bestArrangement.lineup.captain)}; ${esc(L.slot.bench)}: ${R.bestArrangement.lineup.bench.map(nm).join(', ')})</p>` : ''}
${R.bestRoster ? `<p>${esc(L.bestRos.replace('{x}', f1(R.bestRoster.points)))}: ${R.bestRoster.lineup.roster.map(nm).join(', ')} · © ${nm(R.bestRoster.lineup.captain)}</p>` : ''}
<h3>${esc(L.lessonsH)}</h3><ul>${R.lessons.map(l => `<li>${esc((L.ls[l.k] || l.k).replace('{v}', f1(l.v)).replace('{p}', P.get(l.c)?.dn || X.teams[l.c] || ''))}</li>`).join('') || `<li>${esc(L.noLessons)}</li>`}</ul></section>`;
  }
  // διόρθωση σύνθεσης όπως είναι στο επίσημο παιχνίδι
  const all = [...lu.start, lu.sixth, ...lu.bench];
  const ed = `<details class="fmimp"><summary>${esc(L.editH)}</summary><p class="sub">${esc(L.editHelp)}</p><div class="tbl"><table class="antbl"><tbody>${all.map(c => `<tr><td class="l">${nm(c)}</td><td><select data-lslot="${c}">${['start', 'sixth', 'bench'].map(s => `<option value="${s}"${(lu.start.includes(c) ? 'start' : lu.sixth === c ? 'sixth' : 'bench') === s ? ' selected' : ''}>${esc(L.slot[s])}</option>`).join('')}</select></td><td><label><input type="radio" name="lcap" value="${c}"${c === lu.captain ? ' checked' : ''}${lu.start.includes(c) ? '' : ' disabled'}> ©</label></td></tr>`).join('')}</tbody></table></div><p><button type="button" data-lact="reset">${esc(L.resetL)}</button></p></details>`;
  app.innerHTML = sb + recH + alH + cards + projC + tl + rv + ed + `<p class="note">${esc(L.disc)}</p>`;
}

app.addEventListener('change', e => {
  const el = e.target, { t, S, lu } = lineupNow(); if (!t || !lu) return;
  const cur = { start: [...lu.start], sixth: lu.sixth, bench: [...lu.bench], captain: lu.captain, coach: lu.coach };
  if (el.dataset.lslot) {
    const c = el.dataset.lslot, to = el.value, all = [...cur.start, cur.sixth, ...cur.bench];
    const slots = Object.fromEntries(all.map(x => [x, cur.start.includes(x) ? 'start' : cur.sixth === x ? 'sixth' : 'bench']));
    const from = slots[c]; slots[c] = to;
    // ανταλλαγή: ο πρώτος της θέσης «to» (ίδια θέση παίκτη αν γίνεται) πάει εκεί που ήταν ο c
    const other = all.find(x => x !== c && slots[x] === to && (to === 'sixth' || P.get(x).pos === P.get(c).pos)) || all.find(x => x !== c && slots[x] === to);
    if (other && to !== 'bench' || other && from !== 'bench') slots[other] = from;
    cur.start = all.filter(x => slots[x] === 'start'); cur.sixth = all.find(x => slots[x] === 'sixth') || null; cur.bench = all.filter(x => slots[x] === 'bench');
    if (!cur.start.includes(cur.captain)) cur.captain = cur.start[0];
  }
  if (el.name === 'lcap') cur.captain = el.value;
  t.live = t.live || {}; t.live[X.round] = cur; saveS(S); render();
});
app.addEventListener('click', e => {
  if (e.target.closest('[data-lact="reset"]')) { const { t, S } = lineupNow(); if (t?.live) { delete t.live[X.round]; saveS(S); render(); } }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden && X.current) poll(); });
init();
