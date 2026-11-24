import { f, pl, pick, surname, r1 } from '../editorial.mjs';
import { pub, mean } from '../stats.mjs';
import { teamName, teamColor } from '../../../video-factory/src/data/model.mjs';

// Family E: special editorial formats.

const D = (recommended, supported = ['short', 'medium', 'long']) => ({ recommended, supported });
const ALL = ['9x16', '16x9', '1x1'];
const rec = s => s.split('-').map(Number);

export default [
  {
    id: 'basketball-stock-market', number: 26, name: 'Basketball Stock Market', family: 'special', kicker: 'STOCK MARKET',
    description: 'Fantasy prices as a stock market: biggest risers and fallers, with the price chart.',
    concept: 'Official EuroLeague Fantasy price history by round; change from the first tracked round to now.',
    audience: 'EuroLeague Fantasy managers', durations: D('short'), aspects: ALL,
    requires: [{ dataset: 'priceHistory', why: 'price by round' }, { dataset: 'boxscores', why: 'names and teams' }], validation: ['at least 4 tracked rounds', 'price change ≥ 1.5 credits'],
    scriptStructure: ['hook: market open', 'evidence: top riser', 'sequence: price chart', 'narrative: biggest faller', 'conclusion', 'question: buy or sell?'], visual: 'kit: board → bars', narration: { style: 'energetic', notes: 'Market-report parody, serious numbers.' }, frequency: 'every round', fantasy: true,
    example: '"Up 4.1 credits since round 4: the hottest stock in the EuroLeague."', hashtags: ['EuroLeagueFantasy', 'Prices'],
    candidates(ctx) {
      const H = ctx.priceHist(), rows = [];
      for (const [code, byRound] of Object.entries(H)) {
        const p = ctx.model.byCode.get(code); if (!p) continue;
        const rs = Object.keys(byRound).map(Number).sort((a, b) => a - b); if (rs.length < 4) continue;
        const first = byRound[rs[0]], last = byRound[rs.at(-1)];
        rows.push({ ...pub(p), from: first, to: last, change: r1(last - first), r0: rs[0], r1: rs.at(-1), series: rs.map(r => ({ round: r, price: byRound[r] })) });
      }
      const up = [...rows].sort((a, b) => b.change - a.change).filter(r => r.change >= 1.5).slice(0, 3), down = [...rows].sort((a, b) => a.change - b.change).filter(r => r.change <= -1.5).slice(0, 2);
      if (!up.length || !down.length) return [];
      const top = up[0], low = down[0];
      return [{
        key: `stocks-r${top.r1}`, title: 'The Fantasy stock market', sub: `Price changes since round ${top.r0}`, hook: `${top.name} is the hottest stock in EuroLeague Fantasy`, linkPath: `/en/fantasy/round-${ctx.nextRound}/player-prices/`,
        entities: { players: [...up, ...down].map(r => r.code), teams: [] }, significance: Math.min(1, top.change / 5), quality: 0.9, fantasy: true,
        data: { up, down, round0: top.r0, round1: top.r1, absDown: Math.abs(low.change) },
        question: `${surname(top.name)}: buy now or sell high?`,
        plan: [
          { id: 'movers', kind: 'board', head: 'Biggest movers', sub: `Fantasy price change, round ${top.r0} → ${top.r1}`, rows: [...up, ...down].map((r, i) => ({ key: r.slug, rank: r.change > 0 ? '▲' : '▼', label: r.name, sub: `${f(r.from)} → ${f(r.to)}`, value: r.change, display: `${r.change > 0 ? '+' : ''}${f(r.change)}`, color: r.change > 0 ? '#2fae66' : '#e5484d' })) },
          { id: 'chart', kind: 'bars', head: `${top.name}: price by round`, sub: top.teamName, cols: top.series.map(s => ({ key: String(s.round), label: `R${s.round}`, value: s.price })) },
        ],
        beats: [
          { id: 'hook', scene: 'intro', role: 'hook', text: pick(top.code, [`Good evening, and welcome to the EuroLeague Fantasy market.`, `Market report: who is up, who is down.`]) },
          { id: 'top', scene: 'movers', role: 'evidence', text: `Top riser: ${top.name}, up ${f(top.change)} credits since round ${top.r0}, now ${f(top.to)}.`, focus: top.slug },
          ...up.slice(1).map(r => ({ id: `u-${r.slug}`, scene: 'movers', role: 'sequence', text: `${r.name}, up ${f(r.change)}.`, focus: r.slug, minPreset: 'medium' })),
          { id: 'low', scene: 'movers', role: 'narrative', text: `Biggest faller: ${low.name}, down ${f(Math.abs(low.change))}.`, focus: low.slug },
          { id: 'chart', scene: 'chart', role: 'sequence', text: `Here is ${surname(top.name)}'s chart, round by round.`, minPreset: 'medium' },
          { id: 'concl', scene: 'chart', role: 'conclusion', text: `From ${f(top.from)} to ${f(top.to)}. The market has noticed.` },
        ],
      }];
    },
  },
  {
    id: 'perfect-team', number: 27, name: 'The Perfect Team', family: 'special', kicker: 'THE PERFECT TEAM',
    description: 'The best possible Fantasy team for the round within the budget and roster rules.',
    concept: 'Optimise projected PIR under budget, roster-size, position and per-team limits.', audience: 'EuroLeague Fantasy managers', durations: D('medium'), aspects: ALL,
    requires: [{ dataset: 'projections', why: 'projected PIR' }, { dataset: 'fantasyPrices', why: 'prices' }, { dataset: 'fantasyRules', why: 'roster size and position slots' }],
    validation: ['valid under every game rule', 'projections quality ok'], scriptStructure: ['hook', 'evidence', 'sequence', 'conclusion', 'question'], visual: 'kit: board → big', narration: { style: 'energetic', notes: 'Coach announcing the lineup.' }, frequency: 'every round', fantasy: true,
    example: '"100 credits, the best projected ten: 214 PIR."',
  },
  {
    id: 'home-court-myth', number: 28, name: 'The Home Court Myth', family: 'special', kicker: 'THE HOME COURT MYTH',
    description: 'How much home court is really worth this season, and who depends on it most.',
    concept: 'League-wide home win % from results; teams with the biggest home/away gap from standings.',
    audience: 'All fans; bettors', durations: D('short'), aspects: ALL, requires: [{ dataset: 'standings', why: 'home and away records' }, { dataset: 'results', why: 'home win rate', min: { games: 60 } }],
    validation: ['at least 60 games', 'team gap from at least 5 home and 5 away games'], scriptStructure: ['hook: the myth', 'evidence: league home win %', 'narrative: biggest gaps', 'conclusion', 'question'],
    visual: 'kit: big → split', narration: { style: 'analyst', notes: 'Myth-busting.' }, frequency: 'monthly',
    example: '"Home teams win 62% of games. Real Madrid: 6-0 at home, 1-6 away."', hashtags: ['EuroLeague', 'HomeCourt'],
    candidates(ctx) {
      const G = ctx.played; if (G.length < 60) return [];
      const hw = G.filter(g => g[4] > g[5]).length, pct = Math.round(100 * hw / G.length);
      const T = (ctx.cache.league.stand || []).map(s => { const [hW, hL] = rec(s[6]), [aW, aL] = rec(s[7]); return { team: s[1], name: teamName(s[1]), color: teamColor(s[1]), hW, hL, aW, aL, hp: Math.round(100 * hW / (hW + hL || 1)), ap: Math.round(100 * aW / (aW + aL || 1)) }; })
        .filter(t => t.hW + t.hL >= 5 && t.aW + t.aL >= 5).map(t => ({ ...t, gap: t.hp - t.ap })).sort((a, b) => b.gap - a.gap);
      if (T.length < 10) return [];
      const hi = T[0], rev = T.at(-1);
      const busted = pct < 58;
      return [{
        key: `home-r${ctx.lastRound}`, title: busted ? 'Is home court overrated?' : 'Home court is real', sub: `${G.length} games this season`, hook: `Home teams have won ${pct}% of EuroLeague games this season`, linkPath: '/en/',
        entities: { players: [], teams: [hi.team, rev.team] }, significance: Math.min(1, hi.gap / 80), quality: Math.min(1, G.length / 150), data: { games: G.length, homeWins: hw, pct, hi, rev, away: G.length - hw },
        question: `Which arena is the hardest place to win?`,
        plan: [
          { id: 'big', kind: 'big', head: 'Home teams win', value: pct, display: `${pct}%`, label: `${hw} of ${G.length} games`, cards: [{ key: 'h', label: 'Home wins', value: hw }, { key: 'a', label: 'Away wins', value: G.length - hw }] },
          { id: 'split', kind: 'split', head: 'Home vs away win %', sub: 'Biggest gap and reverse', rows: [hi, rev].map(t => ({ key: t.team, label: t.name, display: `${t.hW}-${t.hL} home · ${t.aW}-${t.aL} away`, parts: [{ value: t.hp, color: '#e4572e', text: `${t.hp}% home` }, { value: t.ap, color: '#4cc2ff', text: `${t.ap}% away` }] })), legend: [{ label: 'Home win %', color: '#e4572e' }, { label: 'Away win %', color: '#4cc2ff' }] },
        ],
        beats: [
          { id: 'hook', scene: 'intro', role: 'hook', text: `Everyone says home court matters. How much, exactly?` },
          { id: 'pct', scene: 'big', role: 'evidence', text: `This season home teams have won ${hw} of ${G.length} games: ${pct} percent.` },
          { id: 'hi', scene: 'split', role: 'narrative', text: `${hi.name} are ${hi.hW} and ${hi.hL} at home, ${hi.aW} and ${hi.aL} on the road.`, focus: hi.team },
          { id: 'rev', scene: 'split', role: 'narrative', text: `${rev.name} buck the trend: ${rev.aW} and ${rev.aL} away, ${rev.hW} and ${rev.hL} at home.`, focus: rev.team, minPreset: 'medium' },
          { id: 'concl', scene: 'split', role: 'conclusion', text: busted ? `An edge, yes. A guarantee, not even close.` : `For some teams, home court is everything.` },
        ],
      }];
    },
  },
  {
    id: 'basketball-daily-show', number: 29, name: 'The Basketball Daily Show', family: 'special', kicker: 'THE DAILY SHOW',
    description: 'The latest round in one video: every result and the top performer of each game.',
    concept: 'Results of the most recent round from the results dataset plus the best PIR per game from box scores.', audience: 'All fans, the morning after', durations: D('long', ['medium', 'long', 'editorial']), aspects: ALL,
    requires: [{ dataset: 'results', why: 'scores' }, { dataset: 'boxscores', why: 'top performers' }], validation: ['round must be complete or at least 4 games played', 'top performer = max PIR in that game'],
    scriptStructure: ['hook', 'sequence: each result', 'evidence: performance of the round', 'conclusion', 'question'], visual: 'kit: board → big', narration: { style: 'energetic', notes: 'News anchor.' }, frequency: 'day after each game day', gameDay: true,
    example: '"Round 13: Milan beat Fenerbahce 88-79, Moses Wright 36 PIR…"', hashtags: ['EuroLeague', 'Recap'],
    candidates(ctx, { round } = {}) {
      const r = round || Math.max(...ctx.played.map(g => g[0]));
      const games = ctx.played.filter(g => g[0] === r);
      if (games.length < 4) return [];
      const perf = (h, a) => ctx.model.players.flatMap(p => p.games.filter(g => g.round === r && [h, a].includes(p.team) && [h, a].includes(g.opp)).map(g => ({ p, g }))).sort((x, y) => y.g.pir - x.g.pir)[0];
      const rows = games.map(g => { const [rr, , h, a, hs, as] = g, w = hs > as ? h : a; const t = perf(h, a); return { key: `${h}-${a}`, h, a, hs, as, winner: w, winnerName: teamName(w), loserName: teamName(w === h ? a : h), ws: Math.max(hs, as), ls: Math.min(hs, as), top: t ? { ...pub(t.p), pir: t.g.pir, pts: t.g.pts } : null }; });
      const best = rows.filter(x => x.top).sort((a, b) => b.top.pir - a.top.pir)[0];
      const close = [...rows].sort((a, b) => (a.ws - a.ls) - (b.ws - b.ls))[0];
      return [{
        key: `round-${r}`, title: `Round ${r}: all the results`, sub: `${games.length} games`, hook: `EuroLeague round ${r}: every result in one video`, linkPath: '/en/',
        entities: { players: rows.map(x => x.top?.code).filter(Boolean), teams: rows.map(x => x.winner) }, significance: 0.7, quality: 0.95, timely: true, data: { round: r, rows, best, close, margin: close.ws - close.ls },
        question: `Game of the round: which one was yours?`,
        plan: [
          { id: 'res', kind: 'board', head: `Round ${r} results`, sub: 'Top performer by PIR', rows: rows.map((x, i) => ({ key: x.key, rank: i + 1, label: `${teamName(x.h)} ${x.hs}–${x.as} ${teamName(x.a)}`, sub: x.top ? `${x.top.name} · ${x.top.pir} PIR` : '', value: x.ws - x.ls, display: `+${x.ws - x.ls}`, unit: x.winnerName, color: teamColor(x.winner) })) },
          { id: 'best', kind: 'big', head: best.top.name, sub: `${best.top.teamName} · ${best.winnerName} ${best.ws}-${best.ls}`, value: best.top.pir, label: 'PIR: performance of the round', cards: [{ key: 'pts', label: 'Points', value: best.top.pts }] },
        ],
        beats: [
          { id: 'hook', scene: 'intro', role: 'hook', text: pick(r, [`Round ${r} is in the books. Here is everything you missed.`, `Good morning. Round ${r}, in one video.`]) },
          ...rows.map((x, i) => ({ id: `g-${x.key}`, scene: 'res', role: 'sequence', text: `${x.winnerName} beat ${x.loserName}, ${x.ws} to ${x.ls}${x.top ? `. ${x.top.name}: ${x.top.pir} PIR` : ''}.`, focus: x.key, minPreset: i < 3 ? 'short' : i < 6 ? 'medium' : 'long' })),
          { id: 'close', scene: 'res', role: 'narrative', text: `Closest game: ${close.winnerName} by ${close.ws - close.ls}.`, focus: close.key, minPreset: 'long' },
          { id: 'best', scene: 'best', role: 'evidence', text: `Performance of the round: ${best.top.name}, ${best.top.pir} PIR and ${pl(best.top.pts, 'point')}.` },
          { id: 'concl', scene: 'best', role: 'conclusion', text: `That's round ${r}.` },
        ],
      }];
    },
  },
  {
    id: 'basketball-world-ranking', number: 30, name: 'The Basketball World Ranking', family: 'special', kicker: 'WORLD RANKING',
    description: 'A global ranking of clubs or players across competitions.', concept: 'Cross-competition rating (strength-adjusted) for clubs worldwide.', audience: 'Global basketball fans', durations: D('medium'), aspects: ALL,
    requires: [{ dataset: 'multiCompetition', why: 'comparable data for leagues worldwide' }], validation: ['competition-strength adjustment', 'minimum games per club'], scriptStructure: ['hook', 'evidence', 'sequence', 'conclusion', 'question'],
    visual: 'kit: board', narration: { style: 'analyst', notes: 'Authoritative.' }, frequency: 'monthly', example: '"The world’s top 10 clubs this month."',
  },
];
