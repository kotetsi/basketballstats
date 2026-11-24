import { f, pl, pick, surname, list, r1 } from '../editorial.mjs';
import { qualified, minGames, pub, perGame, mean, percentile, teamProfiles, starters, fixturesNext, ageOf } from '../stats.mjs';
import { teamName, teamColor } from '../../../video-factory/src/data/model.mjs';

const D = (recommended, supported = ['short', 'medium', 'long']) => ({ recommended, supported });
const ALL = ['9x16', '16x9', '1x1'];
const box = { dataset: 'boxscores', why: 'season box scores' };
const lastSeason = ctx => { const h = ctx.hist(); const k = Object.keys(h).filter(x => h[x]?.rows?.length).sort().at(-1); return k ? { code: k, rows: h[k].rows } : null; };
const seasonLabel = code => `${code.slice(1)}-${String(+code.slice(1) + 1).slice(2)}`;

export default [
  {
    id: 'underrated-player', number: 9, name: 'The Underrated Player', family: 'discovery', kicker: 'THE UNDERRATED PLAYER',
    description: 'Production per minute that the minutes (and the Fantasy price) do not reflect yet.',
    concept: 'Qualified players under 22 minutes a game, ranked by PIR per minute; Fantasy price shown when available.',
    audience: 'Fantasy managers hunting value; scouts', durations: D('short'), aspects: ALL,
    requires: [box, { dataset: 'fantasyPrices', why: 'price context' }], validation: ['qualified on games', 'under 22 minutes a game', 'top PIR per minute'],
    scriptStructure: ['hook', 'evidence: PIR per minute vs league', 'narrative: what more minutes could mean', 'conclusion: price', 'question'], visual: 'kit: big → board', narration: { style: 'energetic', notes: 'Scout-like discovery tone.' }, frequency: 'weekly', fantasy: true,
    example: '"He plays 17 minutes. Per minute, he is a top-10 producer."', hashtags: ['EuroLeagueFantasy', 'Sleeper'],
    candidates(ctx, { maxMin = 22, count = 5 } = {}) {
      const Q = qualified(ctx).map(p => ({ p, v: perGame(p) })), lg = Math.round(mean(Q.map(x => x.v.pirPerMin)) * 100) / 100;
      const low = Q.filter(x => x.v.min < maxMin && x.v.min >= 10).sort((a, b) => b.v.pirPerMin - a.v.pirPerMin).slice(0, count);
      if (low.length < 3) return [];
      const rank = x => Q.filter(y => y.v.pirPerMin > x.v.pirPerMin).length + 1;
      const rows = low.map((x, i) => ({ rank: i + 1, ...pub(x.p), ppm: Math.round(x.v.pirPerMin * 100) / 100, min: x.v.min, pir: x.v.pir, price: x.p.price, leagueRank: rank(x) }));
      const a = rows[0], per30 = r1(a.ppm * 30);
      return [{
        key: `${a.slug}-r${ctx.lastRound}`, title: `${a.name}: the underrated one`, sub: `${f(a.min)} minutes a game`, hook: `${a.name} produces like a starter in ${f(a.min)} minutes`, linkPath: `/en/player/${a.slug}/`,
        entities: { players: rows.map(r => r.code), teams: [a.team] }, significance: Math.min(1, a.ppm / (lg * 2)), quality: 0.8, fantasy: true,
        data: { rows, leaguePpm: lg, per30, minutes: 30, maxMin, qualifiedCount: Q.length, leader: a }, question: `Should ${surname(a.name)} get more minutes?`,
        plan: [
          { id: 'big', kind: 'big', head: a.name, sub: `${a.teamName} · ${f(a.min)} min a game`, value: a.ppm, display: a.ppm.toFixed(2), label: 'PIR per minute', chip: { label: 'League average', value: lg }, cards: [{ key: 'rank', label: `Rank of ${Q.length}`, value: a.leagueRank }, { key: 'pir', label: 'PIR a game', value: a.pir }, ...(a.price != null ? [{ key: 'price', label: 'Fantasy price', value: a.price }] : [])] },
          { id: 'board', kind: 'board', head: 'PIR per minute', sub: `Under ${maxMin} minutes a game`, unit: 'per min', rows: rows.map(r => ({ key: String(r.rank), rank: r.rank, label: r.name, sub: `${f(r.min)} min · ${r.teamName}`, value: r.ppm, display: r.ppm.toFixed(2), color: r.color })) },
        ],
        beats: [
          { id: 'hook', scene: 'intro', role: 'hook', text: pick(a.code, [`He barely plays half the game. Look at what he does with it.`, `The box score hides him. The per-minute numbers don't.`]) },
          { id: 'ev', scene: 'big', role: 'evidence', text: `${a.name} averages ${a.ppm.toFixed(2)} PIR per minute. ${a.leagueRank === 1 ? `That is the best rate of all ${Q.length} qualified players` : `That ranks ${a.leagueRank} of ${Q.length} qualified players`}.` },
          { id: 'nar', scene: 'big', role: 'narrative', text: `At that rate, 30 minutes would be worth about ${f(per30)} PIR.`, focus: 'pir', minPreset: 'medium' },
          ...rows.slice(1, 3).map(r => ({ id: `r${r.rank}`, scene: 'board', role: 'sequence', text: `Also on the list: ${r.name}, ${r.ppm.toFixed(2)} in ${f(r.min)} minutes.`, focus: String(r.rank), minPreset: 'medium' })),
          { id: 'concl', scene: 'board', role: 'conclusion', text: a.price != null ? `His Fantasy price: ${f(a.price)}. The minutes decide the rest.` : `The minutes decide the rest.`, focus: '1' },
        ],
      }];
    },
  },
  {
    id: 'future-stars', number: 10, name: 'The Future Stars', family: 'discovery', kicker: 'THE FUTURE STARS',
    description: 'The best young players in the EuroLeague and how they have grown since last season.',
    concept: 'Players aged 23 or younger ranked by PIR, with last season’s PIR from the history dataset to show development.',
    audience: 'Fans and scouts; long-term Fantasy planning', durations: D('medium'), aspects: ALL,
    requires: [box, { dataset: 'bio', why: 'age' }, { dataset: 'history', why: 'previous-season development', min: { seasons: 1 } }],
    validation: ['age ≤ 23 at data date', 'qualified on games', 'previous season PIR shown only if 5+ games played'], scriptStructure: ['hook', 'sequence: top young players', 'evidence: development since last season', 'conclusion', 'question'],
    visual: 'kit: board → compare', narration: { style: 'energetic', notes: 'Optimistic, forward-looking.' }, frequency: 'monthly',
    example: '"21 years old, 15.2 PIR, up 6 from last season."', hashtags: ['EuroLeague', 'NextGen'],
    candidates(ctx, { maxAge = 23, count = 5 } = {}) {
      const prev = lastSeason(ctx), prevBy = new Map((prev?.rows || []).filter(r => r[4] >= 5).map(r => [r[0], r]));
      const young = qualified(ctx).map(p => ({ p, age: ageOf(ctx, p.code) })).filter(x => x.age != null && x.age <= maxAge).sort((a, b) => b.p.season.pir - a.p.season.pir).slice(0, count);
      if (young.length < 3) return [];
      const rows = young.map((x, i) => { const pr = prevBy.get(x.p.code); return { rank: i + 1, ...pub(x.p), age: x.age, pir: x.p.season.pir, prevPir: pr ? pr[9] : null, growth: pr ? r1(x.p.season.pir - pr[9]) : null }; });
      const a = rows[0], g = rows.filter(r => r.growth != null).sort((x, y) => y.growth - x.growth)[0];
      return [{
        key: `u${maxAge}-r${ctx.lastRound}`, title: `The future stars`, sub: `Age ${maxAge} or younger · ranked by PIR`, hook: `The EuroLeague's best players aged ${maxAge} or under`, linkPath: '/en/leaders/youngest-players/',
        entities: { players: rows.map(r => r.code), teams: [] }, significance: 0.6, quality: 0.85, data: { rows, maxAge, prevSeason: prev ? seasonLabel(prev.code) : null, grower: g || null },
        question: `Which one becomes a EuroLeague star first?`,
        plan: [
          { id: 'board', kind: 'board', head: `Best players aged ${maxAge} or under`, sub: 'PIR per game', unit: 'PIR', rows: rows.map(r => ({ key: String(r.rank), rank: r.rank, label: r.name, sub: `${r.age} · ${r.teamName}`, value: r.pir, color: r.color })) },
          ...(g ? [{ id: 'grow', kind: 'compare', a: { name: `Last season`, sub: data_prev(prev), color: '#4cc2ff' }, b: { name: 'This season', sub: g.name, color: g.color }, rows: [{ key: 'pir', label: 'PIR', a: g.prevPir, b: g.pir }] }] : []),
        ],
        beats: [
          { id: 'hook', scene: 'intro', role: 'hook', text: pick(a.code, [`The next generation is already producing.`, `Remember these names.`]) },
          ...[...rows].reverse().map(r => ({ id: `r${r.rank}`, scene: 'board', role: r.rank === 1 ? 'evidence' : 'sequence', text: `${r.rank === 1 ? 'Number one' : `Number ${r.rank}`}: ${r.name}, ${r.age}, with ${f(r.pir)} PIR.`, focus: String(r.rank), minPreset: r.rank > 3 ? 'medium' : 'short' })),
          ...(g ? [{ id: 'grow', scene: 'grow', role: 'narrative', text: `The biggest jump: ${g.name}, from ${f(g.prevPir)} PIR last season to ${f(g.pir)} now.`, focus: 'pir' }] : []),
          { id: 'concl', scene: g ? 'grow' : 'board', role: 'conclusion', text: `${surname(a.name)} leads the group at ${a.age} years old.` },
        ],
      }];
      function data_prev(p) { return p ? seasonLabel(p.code) : ''; }
    },
  },
  {
    id: 'player-transformation', number: 11, name: 'The Player Transformation', family: 'discovery', kicker: 'THE TRANSFORMATION',
    description: 'The biggest year-over-year change in production.',
    concept: 'This season’s per-game numbers against last season’s (history dataset, same player id), largest PIR increase.',
    audience: 'Fans following player development; Fantasy managers', durations: D('medium'), aspects: ALL,
    requires: [box, { dataset: 'history', why: 'last season averages', min: { seasons: 1 } }], validation: ['10+ games last season', 'qualified this season', 'PIR change ≥ 4'],
    scriptStructure: ['hook', 'evidence: before vs after', 'narrative: what changed (minutes, scoring)', 'conclusion', 'question'], visual: 'kit: compare → big', narration: { style: 'energetic', notes: 'Before/after story.' }, frequency: 'every 2 weeks', fantasy: true,
    example: '"Last season 8.1 PIR. This season 17.4."', hashtags: ['EuroLeague', 'Glowup'],
    candidates(ctx) {
      const prev = lastSeason(ctx); if (!prev) return [];
      const P = new Map(prev.rows.filter(r => r[4] >= 10).map(r => [r[0], r]));
      const ch = qualified(ctx).filter(p => P.has(p.code)).map(p => { const r = P.get(p.code); return { p, r, d: r1(p.season.pir - r[9]) }; }).filter(x => x.d >= 4).sort((a, b) => b.d - a.d).slice(0, 2);
      return ch.map(({ p, r, d }) => {
        const before = { games: r[4], min: r[5], pts: r[6], reb: r[7], ast: r[8], pir: r[9] }, now = p.season;
        const minUp = r1(now.min - before.min);
        return {
          key: p.slug, title: `${p.name}: the transformation`, sub: `${seasonLabel(prev.code)} → now`, hook: `${p.name} has added ${f(d)} PIR a game`, linkPath: `/en/player/${p.slug}/`,
          entities: { players: [p.code], teams: [p.team] }, significance: Math.min(1, d / 10), quality: Math.min(1, now.games / 10), data: { player: pub(p), before, now, delta: d, minUp, prevSeason: seasonLabel(prev.code) },
          question: `Can ${surname(p.name)} keep this up?`,
          plan: [
            { id: 'cmp', kind: 'compare', a: { name: seasonLabel(prev.code), sub: r[3], color: '#4cc2ff' }, b: { name: 'This season', sub: p.teamName, color: p.color }, rows: [{ key: 'pir', label: 'PIR', a: before.pir, b: now.pir }, { key: 'pts', label: 'Points', a: before.pts, b: now.pts }, { key: 'reb', label: 'Rebounds', a: before.reb, b: now.reb }, { key: 'ast', label: 'Assists', a: before.ast, b: now.ast }, { key: 'min', label: 'Minutes', a: before.min, b: now.min }] },
            { id: 'big', kind: 'big', head: p.name, value: d, display: `+${f(d)}`, label: 'PIR per game vs last season', cards: [{ key: 'g', label: 'Games this season', value: now.games }] },
          ],
          beats: [
            { id: 'hook', scene: 'intro', role: 'hook', text: pick(p.code, [`Same player. Very different numbers.`, `One year can change everything.`]) },
            { id: 'pir', scene: 'cmp', role: 'evidence', text: `Last season: ${f(before.pir)} PIR a game. This season: ${f(now.pir)}.`, focus: 'pir' },
            { id: 'pts', scene: 'cmp', role: 'narrative', text: `Points went from ${f(before.pts)} to ${f(now.pts)}.`, focus: 'pts', minPreset: 'medium' },
            { id: 'reb', scene: 'cmp', role: 'narrative', text: `Rebounds ${f(before.reb)} to ${f(now.reb)}, assists ${f(before.ast)} to ${f(now.ast)}.`, focus: 'reb', minPreset: 'medium' },
            { id: 'min', scene: 'cmp', role: 'narrative', text: minUp > 2 ? `A bigger role helps: ${f(minUp)} more minutes a game.` : `And not just from more minutes: playing time is almost the same.`, focus: 'min', minPreset: 'medium' },
            { id: 'concl', scene: 'big', role: 'conclusion', text: `Plus ${f(d)} PIR a game, over ${pl(now.games, 'game')}. Last season he played ${pl(before.games, 'game')}.` },
          ],
        };
      });
    },
  },
  {
    id: 'team-dna', number: 12, name: 'The Team DNA', family: 'discovery', kicker: 'TEAM DNA',
    description: 'A team’s statistical identity: what it does more, or less, than everyone else.',
    concept: 'Team per-game profile from box scores (points, 3-point rate, assist rate, rebounds, turnovers, steals+blocks, points allowed), as league percentiles.',
    audience: 'Fans of a team; tactics fans', durations: D('medium'), aspects: ALL,
    requires: [box, { dataset: 'results', why: 'points allowed' }], validation: ['at least 6 games', 'identity = traits ≥ 80th or ≤ 20th percentile'],
    scriptStructure: ['hook', 'sequence: radar', 'evidence: top traits', 'conclusion', 'question'], visual: 'kit: radar → board', narration: { style: 'analyst', notes: 'Describe the identity like a scouting report.' }, frequency: 'weekly (rotate teams)',
    example: '"First in assist rate, last in three-point attempts."', hashtags: ['EuroLeague', 'Analytics'],
    candidates(ctx) {
      const T = Object.values(teamProfiles(ctx)).filter(t => t.games >= 6);
      if (T.length < 10) return [];
      const keys = { pts: 'Scoring', fg3Rate: '3-pt rate', astRate: 'Ball movement', reb: 'Rebounding', stocks: 'Defensive plays', protect: 'Ball security' };
      const unit = { pts: 'points', fg3Rate: 'percent of shots from three', astRate: 'percent of baskets assisted', reb: 'rebounds', stocks: 'steals plus blocks', protect: 'turnovers' };
      const val = (t, k) => (k === 'protect' ? -t.tov : t[k]);
      const out = T.map(t => {
        const pctl = Object.fromEntries(Object.keys(keys).map(k => [k, percentile(T.map(x => val(x, k)), val(t, k))]));
        const traits = Object.entries(pctl).filter(([, v]) => v >= 80 || v <= 20).sort((a, b) => Math.abs(b[1] - 50) - Math.abs(a[1] - 50));
        const rank = k => [...T].sort((a, b) => val(b, k) - val(a, k)).findIndex(x => x.team === t.team) + 1;
        return { t, pctl, traits: traits.map(([k, v]) => ({ key: k, label: keys[k], pct: v, rank: rank(k), value: k === 'protect' ? t.tov : t[k], unit: unit[k] })) };
      }).filter(x => x.traits.length >= 2).sort((a, b) => b.traits.length - a.traits.length || Math.abs(b.traits[0].pct - 50) - Math.abs(a.traits[0].pct - 50));
      return out.slice(0, 3).map(({ t, pctl, traits }) => {
        const top = traits.slice(0, 3), nT = T.length;
        const say = x => (x.key === 'protect' ? `${x.rank === 1 ? 'fewest' : `number ${x.rank} for fewest`} turnovers, ${f(x.value)} a game` : `${x.rank === 1 ? 'first' : x.rank === nT ? 'last' : `number ${x.rank}`} in ${x.label.toLowerCase()}, ${f(x.value)} ${x.unit}`);
        return {
          key: t.team.toLowerCase(), title: `${t.name}: team DNA`, sub: `${t.games} games · league percentiles`, hook: `What makes ${t.name} different`, linkPath: `/en/team/${t.team.toLowerCase()}/`,
          entities: { players: [], teams: [t.team] }, significance: Math.min(1, top.length / 3), quality: Math.min(1, t.games / 10), data: { team: t, percentiles: pctl, traits: top, teams: nT },
          question: `Is this the right identity for ${t.name}?`,
          plan: [
            { id: 'radar', kind: 'radar', head: `${t.name}`, sub: `League percentiles · ${nT} teams`, keys: Object.keys(keys), labels: keys, series: [{ name: t.name, values: pctl }, { name: 'League median', values: Object.fromEntries(Object.keys(keys).map(k => [k, 50])) }] },
            { id: 'traits', kind: 'board', head: 'Defining traits', sub: `Rank among ${nT} teams`, rows: top.map((x, i) => ({ key: x.key, rank: `#${x.rank}`, label: x.label, sub: `${f(x.value)} ${x.unit}`, value: x.pct, display: `${x.pct}`, unit: 'pctile', color: t.color })) },
          ],
          beats: [
            { id: 'hook', scene: 'intro', role: 'hook', text: pick(t.team, [`Every team has a fingerprint. This is ${t.name}'s.`, `Strip away the names. What does ${t.name} actually do?`]) },
            { id: 'radar', scene: 'radar', role: 'sequence', text: `Here is how they compare with the league on six dimensions.`, minPreset: 'medium' },
            ...top.map((x, i) => ({ id: `t-${x.key}`, scene: 'traits', role: i === 0 ? 'evidence' : 'narrative', text: `${i === 0 ? 'Most striking' : 'Also'}: ${say(x)}.`, focus: x.key })),
            { id: 'concl', scene: 'traits', role: 'conclusion', text: `That is the ${t.name} identity, after ${pl(t.games, 'game')}.` },
          ],
        };
      });
    },
  },
  {
    id: 'bench-effect', number: 13, name: 'The Bench Effect', family: 'discovery', kicker: 'THE BENCH EFFECT',
    description: 'How much of each team’s scoring comes from the bench.',
    concept: 'Starters from play-by-play; bench share = points by non-starters / team points, over games with play-by-play.',
    audience: 'Team fans; tactics fans', durations: D('short'), aspects: ALL,
    requires: [box, { dataset: 'starters', why: 'who started each game', min: { games: 60 } }], validation: ['team-games with known starters only', 'at least 6 such games per team'],
    scriptStructure: ['hook', 'evidence: most and least bench-dependent', 'sequence: split bars', 'conclusion', 'question'], visual: 'kit: split → board', narration: { style: 'analyst', notes: 'Rotation talk, depth.' }, frequency: 'monthly',
    example: '"44% of their points come off the bench. League low: 22%."', hashtags: ['EuroLeague', 'Depth'],
    candidates(ctx) {
      const S = starters(ctx), T = {};
      for (const p of ctx.model.players) for (const g of p.games) {
        const st = S.get(`${g.round}|${p.code}`); if (st == null) continue;
        const t = (T[`${p.team}`] ||= { team: p.team, games: new Set(), bench: 0, total: 0 });
        t.games.add(g.round); t.total += g.pts; if (!st) t.bench += g.pts;
      }
      const rows = Object.values(T).filter(t => t.games.size >= 6 && t.total).map(t => ({ team: t.team, name: teamName(t.team), color: teamColor(t.team), games: t.games.size, share: r1(100 * t.bench / t.total), benchPpg: r1(t.bench / t.games.size) })).sort((a, b) => b.share - a.share);
      if (rows.length < 10) return [];
      const hi = rows[0], lo = rows.at(-1), avg = r1(mean(rows.map(r => r.share)));
      const show = [...rows.slice(0, 3), ...rows.slice(-2)];
      return [{
        key: `bench-r${ctx.lastRound}`, title: 'The bench effect', sub: `Share of points from the bench · ${rows.length} teams`, hook: `${hi.name} get ${f(hi.share)}% of their points off the bench`, linkPath: '/en/',
        entities: { players: [], teams: [hi.team, lo.team] }, significance: Math.min(1, (hi.share - lo.share) / 30), quality: 0.8, data: { rows, hi, lo, avg },
        question: 'Starters or depth: what wins in the EuroLeague?',
        plan: [
          { id: 'split', kind: 'split', head: 'Who scores: starters vs bench', sub: 'Share of team points', rows: show.map(r => ({ key: r.team, label: r.name, display: `${f(r.share)}% bench`, parts: [{ value: 100 - r.share, color: '#3a4560', text: 'Starters' }, { value: r.share, color: r.color === '#1a1a1a' ? '#e4572e' : '#e4572e', text: `${Math.round(r.share)}%` }] })), legend: [{ label: 'Starters', color: '#3a4560' }, { label: 'Bench', color: '#e4572e' }] },
        ],
        beats: [
          { id: 'hook', scene: 'intro', role: 'hook', text: `Starting five or second unit: who really scores?` },
          { id: 'hi', scene: 'split', role: 'evidence', text: `${hi.name} get ${f(hi.share)} percent of their points from the bench, ${f(hi.benchPpg)} a game.`, focus: hi.team },
          { id: 'lo', scene: 'split', role: 'evidence', text: `At the other end, ${lo.name}: ${f(lo.share)} percent.`, focus: lo.team },
          { id: 'avg', scene: 'split', role: 'narrative', text: `The league average is ${f(avg)} percent.`, minPreset: 'medium' },
          { id: 'concl', scene: 'split', role: 'conclusion', text: `Two very different ways to build a team.` },
        ],
      }];
    },
  },
  {
    id: 'rotation-lab', number: 14, name: 'The Rotation Lab', family: 'discovery', kicker: 'THE ROTATION LAB',
    description: 'Which lineups and rotations work, from lineup stints.', concept: 'Net rating of five-man units and minutes distribution from play-by-play stints.',
    audience: 'Tactics fans, coaches', durations: D('medium'), aspects: ALL, requires: [{ dataset: 'lineups', why: 'five-man stints with points for/against' }],
    validation: ['min. 40 minutes per lineup', 'possession-based net rating'], scriptStructure: ['hook', 'evidence', 'sequence', 'conclusion', 'question'], visual: 'kit: board → split', narration: { style: 'analyst', notes: 'Coach-like.' }, frequency: 'monthly',
    example: '"Their best five: +18 per 100 possessions in 63 minutes."',
  },
  {
    id: 'matchup-lab', number: 15, name: 'The Matchup Lab', family: 'discovery', kicker: 'THE MATCHUP LAB',
    description: 'An upcoming game broken down: team profiles side by side and the model’s pre-game probability.',
    concept: 'Next-round fixture; team per-game profiles; logged model win probability; current records.', audience: 'Fans and bettors before the game', durations: D('short'), aspects: ALL,
    requires: [{ dataset: 'schedule', why: 'upcoming fixtures' }, { dataset: 'matchPredictions', why: 'pre-game win probability' }, box, { dataset: 'standings', why: 'records' }],
    validation: ['game not started', 'prediction logged for this game'], scriptStructure: ['hook', 'evidence: key profile gaps', 'narrative: records', 'conclusion: model probability', 'question'],
    visual: 'kit: compare → big', narration: { style: 'energetic', notes: 'Pre-game hype with numbers.' }, frequency: 'game days', gameDay: true,
    example: '"Valencia score 94 a game; Panathinaikos allow 81. The model: 58% Valencia."', hashtags: ['EuroLeague', 'Preview'],
    candidates(ctx, { count = 3 } = {}) {
      const T = teamProfiles(ctx), L = ctx.predLog(), stand = new Map((ctx.cache.league.stand || []).map(s => [s[1], s]));
      const now = ctx.today.getTime();
      const games = fixturesNext(ctx).filter(g => new Date(g.t).getTime() > now).slice(0, 12)
        .map(g => ({ g, pr: L[`E-${g.r}-${g.h}-${g.a}`] })).filter(x => x.pr && T[x.g.h] && T[x.g.a]);
      return games.map(({ g, pr }) => {
        const H = T[g.h], A = T[g.a], p = Math.round(100 * (pr.last?.p ?? pr.first.p)), fav = p >= 50 ? H : A, fp = Math.max(p, 100 - p);
        const sh = stand.get(g.h), sa = stand.get(g.a);
        const rows = [{ key: 'pts', label: 'Points', a: H.pts, b: A.pts }, { key: 'allowed', label: 'Allowed', a: H.ptsAllowed, b: A.ptsAllowed, lowerBetter: true }, { key: 'fg3Rate', label: '3PA share %', a: H.fg3Rate, b: A.fg3Rate }, { key: 'reb', label: 'Rebounds', a: H.reb, b: A.reb }, { key: 'tov', label: 'Turnovers', a: H.tov, b: A.tov, lowerBetter: true }];
        const gap = rows.slice(0, 2).map(r => ({ ...r, d: Math.abs(r.a - r.b) })).sort((x, y) => y.d - x.d)[0];
        const day = new Date(g.t).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'Europe/Athens' });
        return {
          key: `r${g.r}-${g.h}-${g.a}`.toLowerCase(), title: `${H.name} vs ${A.name}`, sub: `Round ${g.r} · ${day}`, hook: `${H.name} vs ${A.name}: the numbers before tip-off`, linkPath: '/en/predictions/',
          entities: { players: [], teams: [g.h, g.a] }, significance: 1 - Math.abs(p - 50) / 50 * 0.6, quality: 0.85, timely: new Date(g.t),
          data: { round: g.r, start: g.t, home: H, away: A, p, favPct: fp, favName: fav.name, rec: { h: sh ? [sh[2], sh[3]] : null, a: sa ? [sa[2], sa[3]] : null } },
          question: `Who wins ${H.name} vs ${A.name}?`,
          plan: [
            { id: 'cmp', kind: 'compare', a: { name: H.name, sub: sh ? `${sh[2]}-${sh[3]} · home` : 'home', color: H.color }, b: { name: A.name, sub: sa ? `${sa[2]}-${sa[3]} · away` : 'away', color: A.color }, rows },
            { id: 'prob', kind: 'big', head: 'Model win probability', value: fp, display: `${fp}%`, label: fav.name, cards: [] },
          ],
          beats: [
            { id: 'hook', scene: 'intro', role: 'hook', text: pick(g.h + g.a, [`Round ${g.r}: ${H.name} host ${A.name}. Here is what the numbers say.`, `Before tip-off: ${H.name} against ${A.name}.`]) },
            { id: 'rec', scene: 'cmp', role: 'narrative', text: sh && sa ? `${H.name} are ${sh[2]} and ${sh[3]}. ${A.name} are ${sa[2]} and ${sa[3]}.` : `Two teams, very different profiles.` },
            { id: 'gap', scene: 'cmp', role: 'evidence', text: gap.key === 'pts' ? `${H.name} score ${f(H.pts)} a game, ${A.name} ${f(A.pts)}.` : `${H.name} allow ${f(H.ptsAllowed)} a game, ${A.name} ${f(A.ptsAllowed)}.`, focus: gap.key },
            { id: 'reb', scene: 'cmp', role: 'evidence', text: `On the boards: ${f(H.reb)} against ${f(A.reb)}.`, focus: 'reb', minPreset: 'medium' },
            { id: 'concl', scene: 'prob', role: 'conclusion', text: `Our model makes ${fav.name} ${fp} percent favourites.` },
          ],
        };
      }).sort((a, b) => b.significance - a.significance).slice(0, count);
    },
  },
];
