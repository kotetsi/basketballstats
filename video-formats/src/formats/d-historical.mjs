import { f, pl, pick, surname, r1 } from '../editorial.mjs';
import { pub } from '../stats.mjs';
import { TEAMS } from '../../../video-factory/src/data/model.mjs';
const tn = (code, name) => TEAMS[code]?.[0] || name;

// Family D: historical and storytelling, from the history dataset (past seasons) and this season.

const D = (recommended, supported = ['short', 'medium', 'long']) => ({ recommended, supported });
const ALL = ['9x16', '16x9', '1x1'];
const label = code => `${code.slice(1)}-${String(+code.slice(1) + 1).slice(2)}`;
const histReq = { dataset: 'history', why: 'past seasons: standings, finals, player averages', min: { seasons: 3 } };
const topPir = (rows, minG) => [...rows].filter(r => r[4] >= minG).sort((a, b) => b[9] - a[9]);

function seasonStory(ctx, code, h, spec) {
  const fin = h.final, champ = fin ? (fin[2] > fin[5] ? { code: fin[0], name: tn(fin[0], fin[1]) } : { code: fin[3], name: tn(fin[3], fin[4]) }) : null;
  const runner = fin ? (champ.code === fin[0] ? { code: fin[3], name: tn(fin[3], fin[4]) } : { code: fin[0], name: tn(fin[0], fin[1]) }) : null;
  const score = fin ? [Math.max(fin[2], fin[5]), Math.min(fin[2], fin[5])] : null;
  const st = h.stand.slice(0, 5), minG = Math.ceil((h.rsMax || 30) * 0.5);
  const mvp = topPir(h.rows, minG)[0], scorer = [...h.rows].filter(r => r[4] >= minG).sort((a, b) => b[6] - a[6])[0];
  if (!champ || !mvp) return null;
  return { fin, champ, runner, score, st: st.map(x => [x[0], x[1], tn(x[1], x[2]), x[3], x[4]]), minG, mvp, scorer, label: label(code), year: +code.slice(1) };
}

export default [
  {
    id: 'basketball-time-machine', number: 22, name: 'Basketball Time Machine', family: 'historical', kicker: 'TIME MACHINE',
    description: 'Back to a past season: who ruled, who won, and how it compares with now.',
    concept: 'A season from the history dataset (5 years back by default): champion, top of the standings, best player by PIR, compared with this season’s leader.',
    audience: 'Nostalgic fans; evergreen content for days without games', durations: D('medium'), aspects: ALL, requires: [histReq, { dataset: 'boxscores', why: 'this season for comparison' }],
    validation: ['season must have standings, final and player rows', 'player minimum: half the regular-season games'], scriptStructure: ['hook: the year', 'narrative: standings', 'evidence: best player', 'conclusion: then vs now', 'question'],
    visual: 'kit: board → big → compare', narration: { style: 'analyst', notes: 'Storyteller, warm.' }, frequency: 'weekly (evergreen)', evergreen: true,
    example: '"2021-22: Anadolu Efes champions, and the best PIR in the league was…"', hashtags: ['EuroLeague', 'Throwback'],
    candidates(ctx, { yearsBack = [5, 8, 3] } = {}) {
      const H = ctx.hist(), now = +ctx.season.slice(1), out = [];
      for (const yb of [].concat(yearsBack)) {
        const code = `E${now - yb}`, h = H[code]; if (!h?.rows?.length || !h.final) continue;
        const S = seasonStory(ctx, code, h, this); if (!S) continue;
        const nowTop = [...ctx.model.players].filter(p => p.season && p.season.games >= Math.ceil(ctx.lastRound / 2)).sort((a, b) => b.season.pir - a.season.pir)[0];
        const data = { season: S.label, yearsBack: yb, champion: S.champ, runnerUp: S.runner, finalScore: S.score, standings: S.st.map(s => ({ pos: s[0], team: s[1], name: s[2], w: s[3], l: s[4] })), seasonYears: [S.year, +S.label.slice(-2)], mvp: { name: S.mvp[1], team: tn(S.mvp[2], S.mvp[3]), pir: S.mvp[9], games: S.mvp[4] }, now: nowTop ? { ...pub(nowTop), pir: nowTop.season.pir } : null, minGames: S.minG };
        const lead = data.standings[0], mvpName = data.mvp.name.split(', ').reverse().join(' ').replace(/\b(\w)(\w*)/g, (m, a, b) => a + b.toLowerCase());
        out.push({
          key: code.toLowerCase(), title: `Back to ${S.label}`, sub: `${yb} years ago`, hook: `Back to the ${S.label} EuroLeague season`, linkPath: '/en/history/', entities: { players: [], teams: [S.champ.code] },
          significance: 0.5, quality: 0.9, evergreen: true, data, question: `Which team from ${S.label} would win today?`,
          plan: [
            { id: 'stand', kind: 'board', head: `${S.label} regular season`, sub: 'Top 5', rows: data.standings.map(s => ({ key: String(s.pos), rank: s.pos, label: s.name, sub: `${s.w}-${s.l}`, value: s.w, unit: 'wins' })) },
            { id: 'mvp', kind: 'big', head: mvpName, sub: `${data.mvp.team} · ${data.mvp.games} games`, value: data.mvp.pir, label: `Best PIR per game, ${S.label}`, chip: data.now ? { label: `Now: ${data.now.name}`, value: data.now.pir } : null, cards: [] },
            { id: 'final', kind: 'statement', kicker: 'CHAMPIONS', text: `**${S.champ.name}** beat ${S.runner.name} ${S.score[0]}-${S.score[1]} in the final.` },
          ],
          beats: [
            { id: 'hook', scene: 'intro', role: 'hook', text: pick(code, [`Let's go back ${yb} years.`, `Time machine: the ${S.label} season.`]) },
            { id: 'stand', scene: 'stand', role: 'narrative', text: `${lead.name} topped the regular season at ${lead.w} and ${lead.l}.`, focus: String(lead.pos) },
            { id: 'mvp', scene: 'mvp', role: 'evidence', text: `The best PIR in the league: ${mvpName}, ${f(data.mvp.pir)} a game.` },
            { id: 'now', scene: 'mvp', role: 'narrative', text: data.now ? `This season's leader, ${data.now.name}, is at ${f(data.now.pir)}.` : `A different league today.`, minPreset: 'medium' },
            { id: 'final', scene: 'final', role: 'conclusion', text: `And the title went to ${S.champ.name}, ${S.score[0]} to ${S.score[1]} against ${S.runner.name}.` },
          ],
        });
      }
      return out;
    },
  },
  {
    id: 'one-season-in-60-seconds', number: 23, name: 'One Season in 60 Seconds', family: 'historical', kicker: 'ONE SEASON IN 60 SECONDS',
    description: 'An entire EuroLeague season told in about a minute.',
    concept: 'Regular-season top, best player, top scorer, final result, all from the history dataset.',
    audience: 'All fans; evergreen', durations: D('long', ['medium', 'long']), aspects: ALL, requires: [histReq],
    validation: ['complete season (final played)', 'player minimum games'], scriptStructure: ['hook', 'narrative: the regular season', 'evidence: best player and top scorer', 'sequence: the final', 'conclusion', 'question'],
    visual: 'kit: board → big → statement', narration: { style: 'energetic', notes: 'Fast montage pace.' }, frequency: 'weekly (evergreen)', evergreen: true,
    example: '"2024-25 in 60 seconds: Olympiacos 26-12, Vezenkov 20.9 PIR, and the title went to…"', hashtags: ['EuroLeague', 'History'],
    candidates(ctx, { seasons } = {}) {
      const H = ctx.hist(), codes = seasons ? [].concat(seasons) : Object.keys(H).filter(k => H[k]?.final && H[k]?.rows?.length).sort().reverse().slice(0, 3);
      return codes.map(code => {
        const h = H[code]; const S = h && seasonStory(ctx, code, h); if (!S) return null;
        const nm = r => r[1].split(', ').reverse().join(' ').replace(/\b(\w)(\w*)/g, (m, a, b) => a + b.toLowerCase());
        const data = { season: S.label, seconds: 60, rsGames: h.rsMax, standings: S.st.map(s => ({ pos: s[0], team: s[1], name: s[2], w: s[3], l: s[4] })), seasonYears: [S.year, +S.label.slice(-2)], mvp: { name: nm(S.mvp), team: tn(S.mvp[2], S.mvp[3]), pir: S.mvp[9], games: S.mvp[4] }, scorer: { name: nm(S.scorer), team: tn(S.scorer[2], S.scorer[3]), pts: S.scorer[6] }, champion: S.champ, runnerUp: S.runner, finalScore: S.score };
        const lead = data.standings[0];
        return {
          key: code.toLowerCase(), title: `${S.label} in 60 seconds`, sub: 'EuroLeague season recap', hook: `The ${S.label} EuroLeague season in 60 seconds`, linkPath: '/en/history/', entities: { players: [], teams: [S.champ.code, lead.team] },
          significance: 0.5, quality: 0.9, evergreen: true, data, question: `What do you remember most from ${S.label}?`,
          plan: [
            { id: 'stand', kind: 'board', head: 'Regular season', sub: `${h.rsMax} rounds · top 5`, rows: data.standings.map(s => ({ key: String(s.pos), rank: s.pos, label: s.name, sub: `${s.w}-${s.l}`, value: s.w, unit: 'wins' })) },
            { id: 'stars', kind: 'big', head: data.mvp.name, sub: data.mvp.team, value: data.mvp.pir, label: 'PIR per game: best in the league', cards: [{ key: 'scorer', label: `Top scorer: ${data.scorer.name}`, value: data.scorer.pts, unit: ' ppg' }] },
            { id: 'final', kind: 'statement', kicker: 'THE FINAL', text: `**${S.champ.name}** ${S.score[0]}, ${S.runner.name} ${S.score[1]}.` },
          ],
          beats: [
            { id: 'hook', scene: 'intro', role: 'hook', text: `The ${S.label} EuroLeague season. Sixty seconds. Go.` },
            { id: 'lead', scene: 'stand', role: 'narrative', text: `${lead.name} finished first in the regular season, ${lead.w} and ${lead.l}.`, focus: String(lead.pos) },
            ...data.standings.slice(1, 4).map(s => ({ id: `s${s.pos}`, scene: 'stand', role: 'sequence', text: `${s.name}, ${s.w} wins.`, focus: String(s.pos), minPreset: 'long' })),
            { id: 'mvp', scene: 'stars', role: 'evidence', text: `The best PIR: ${data.mvp.name}, ${f(data.mvp.pir)} a game for ${data.mvp.team}.` },
            { id: 'scorer', scene: 'stars', role: 'evidence', text: `Top scorer: ${data.scorer.name}, ${f(data.scorer.pts)} points a game.`, focus: 'scorer' },
            { id: 'final', scene: 'final', role: 'sequence', text: `In the final, ${S.champ.name} beat ${S.runner.name}, ${S.score[0]} to ${S.score[1]}.` },
            { id: 'concl', scene: 'final', role: 'conclusion', text: `${S.champ.name}: champions of Europe.` },
          ],
        };
      }).filter(Boolean);
    },
  },
  {
    id: 'what-happened-next', number: 24, name: 'What Happened Next?', family: 'historical', kicker: 'WHAT HAPPENED NEXT?',
    description: 'A standout season, then the seasons that followed.', concept: 'Player trajectories linked across seasons by player id in the history dataset.',
    audience: 'Fans who love career stories', durations: D('medium'), aspects: ALL, requires: [histReq, { dataset: 'careerLinks', why: 'player careers linked across seasons and teams (incl. outside EuroLeague)' }],
    validation: ['at least 3 consecutive seasons for the player'], scriptStructure: ['hook', 'narrative', 'evidence', 'sequence', 'conclusion', 'question'], visual: 'kit: bars → statement', narration: { style: 'analyst', notes: 'Story arc.' }, frequency: 'monthly', evergreen: true,
    example: '"He led the league in assists in 2019-20. Then this happened."',
  },
  {
    id: 'impossible-record', number: 25, name: 'The Impossible Record', family: 'historical', kicker: 'THE IMPOSSIBLE RECORD',
    description: 'The best single-game performances of the season, and how far ahead the record is.',
    concept: 'Single-game highs this season (PIR, points, rebounds, assists) from box scores; the record and its gap to the next best.',
    audience: 'All fans', durations: D('short'), aspects: ALL, requires: [{ dataset: 'boxscores', why: 'single games' }], validation: ['current season only (historical single-game data not in the dataset)', 'ties shown together'],
    scriptStructure: ['hook', 'evidence: the record', 'sequence: the chasers', 'conclusion: the gap', 'question'], visual: 'kit: big → board', narration: { style: 'hype', notes: 'Awe.' }, frequency: 'monthly',
    example: '"41 PIR in one game. Nobody else has reached 38."', hashtags: ['EuroLeague', 'Record'],
    candidates(ctx) {
      const out = [];
      for (const [k, w] of [['pir', 'PIR'], ['pts', 'points'], ['reb', 'rebounds'], ['ast', 'assists']]) {
        const G = ctx.model.players.flatMap(p => p.games.map(g => ({ p, g, v: g[k] }))).sort((a, b) => b.v - a.v);
        if (G.length < 10) continue;
        const top = G.slice(0, 5), rec = top[0], next = G.find(x => x.v < rec.v);
        const gap = next ? rec.v - next.v : 0;
        const opp = rec.g.opp;
        out.push({
          key: `${k}-r${ctx.lastRound}`, title: `${rec.v} ${w} in one game`, sub: `Season single-game record · through round ${ctx.lastRound}`, hook: `${rec.p.name}: ${rec.v} ${w} in a single game`, linkPath: '/en/leaders/single-game-records/',
          entities: { players: [rec.p.code], teams: [rec.p.team] }, significance: Math.min(1, gap / (rec.v * 0.15 || 1)), quality: 0.95,
          data: { metric: k, record: { ...pub(rec.p), value: rec.v, round: rec.g.round, opp }, gap, next: next ? { name: next.p.name, value: next.v } : null, rows: top.map((x, i) => ({ rank: i + 1, ...pub(x.p), value: x.v, round: x.g.round, opp: x.g.opp })) },
          question: `Will anyone beat ${rec.v} this season?`,
          plan: [
            { id: 'rec', kind: 'big', head: rec.p.name, sub: `Round ${rec.g.round} vs ${opp}`, value: rec.v, label: `${w} in one game`, chip: next ? { label: 'Next best', value: next.v } : null, cards: [] },
            { id: 'board', kind: 'board', head: `Best single games: ${w}`, sub: `Through round ${ctx.lastRound}`, rows: top.map((x, i) => ({ key: String(i + 1), rank: i + 1, label: x.p.name, sub: `R${x.g.round} vs ${x.g.opp}`, value: x.v, color: x.p.color })) },
          ],
          beats: [
            { id: 'hook', scene: 'intro', role: 'hook', text: pick(k + rec.p.code, [`Some nights, one player breaks the scale.`, `This is the number everyone is chasing.`]) },
            { id: 'rec', scene: 'rec', role: 'evidence', text: `${rec.p.name}: ${rec.v} ${w} in round ${rec.g.round}.` },
            ...top.slice(1, 4).map((x, i) => ({ id: `r${i + 2}`, scene: 'board', role: 'sequence', text: `${x.p.name}, ${x.v} in round ${x.g.round}.`, focus: String(i + 2), minPreset: i ? 'medium' : 'short' })),
            { id: 'concl', scene: 'board', role: 'conclusion', text: gap ? `The record is ${gap} clear of the next best.` : `The record is shared.`, focus: '1' },
          ],
        });
      }
      return out.sort((a, b) => b.significance - a.significance).slice(0, 2);
    },
  },
];
