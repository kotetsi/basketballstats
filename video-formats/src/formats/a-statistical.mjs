import { f, pl, pick, surname, list, r1 } from '../editorial.mjs';
import { qualified, minGames, pub, perGame, mean, sd, profiles, cosine, percentile, shotsByPlayer, zoneProfile, ZONE_LABEL, predictionsVsResults } from '../stats.mjs';
import { teamName, teamColor } from '../../../video-factory/src/data/model.mjs';

// Family A: statistical intelligence. Each format turns real data into a production request.

const M = { pts: ['points', 'Points'], reb: ['rebounds', 'Rebounds'], ast: ['assists', 'Assists'], stl: ['steals', 'Steals'], blk: ['blocks', 'Blocks'], pir: ['PIR', 'PIR'], ts: ['true shooting percentage', 'True shooting %'] };
const D = (recommended, supported = ['short', 'medium', 'long']) => ({ recommended, supported });
const ALL = ['9x16', '16x9', '1x1'];
const box = { dataset: 'boxscores', why: 'season averages' };

export default [
  {
    id: 'numbers-dont-lie', number: 1, name: "The Numbers Don't Lie", family: 'statistical', kicker: "THE NUMBERS DON'T LIE",
    description: 'One striking statistical fact, shown with the leaderboard that proves it.',
    concept: 'Find the season average that stands furthest above the league (largest z-score among qualified players) and let the board make the point.',
    audience: 'EuroLeague fans and Fantasy players who like hard numbers',
    durations: D('short'), aspects: ALL, requires: [{ ...box, min: { rounds: 4 } }],
    validation: ['player must meet the minimum games threshold (half the rounds played)', 'leader must be at least 2 standard deviations above the qualified mean'],
    scriptStructure: ['hook: the fact', 'evidence: top 5 board', 'conclusion: the gap to number two', 'question'],
    visual: 'kit: statement → board', narration: { style: 'energetic', notes: 'Confident and punchy. Lead with the number.' }, frequency: '2 per week', fantasy: true, evergreen: false,
    example: '"Sasha Vezenkov averages 23.9 PIR. Nobody else in the EuroLeague is above 21.3."',
    hashtags: ['EuroLeague', 'Stats'],
    candidates(ctx, { count = 5 } = {}) {
      const Q = qualified(ctx), out = [];
      for (const k of ['pts', 'reb', 'ast', 'stl', 'blk', 'pir']) {
        const vals = Q.map(p => p.season[k]), m = mean(vals), s = sd(vals);
        const top = [...Q].sort((a, b) => b.season[k] - a.season[k]).slice(0, count);
        const z = (top[0].season[k] - m) / s;
        if (z < 2 || top[0].season[k] === top[1].season[k]) continue;
        const [a, b] = top, [w, W] = M[k];
        const data = { metric: k, leader: { ...pub(a), value: a.season[k], games: a.season.games }, second: { ...pub(b), value: b.season[k] }, leagueAvg: r1(m), z: r1(z), minGames: minGames(ctx), rows: top.map((p, i) => ({ rank: i + 1, ...pub(p), value: p.season[k] })) };
        const seed = `${a.code}${k}${ctx.lastRound}`;
        out.push({
          key: `${k}-${a.slug}`, title: `${a.name}: ${f(a.season[k])} ${W === 'PIR' ? 'PIR' : W.toLowerCase()} a game`, sub: `Through round ${ctx.lastRound}`,
          hook: `${a.name} leads the EuroLeague in ${w} by a distance`, linkPath: `/en/player/${a.slug}/`, entities: { players: top.map(p => p.code), teams: [a.team] },
          significance: Math.min(1, z / 4), quality: Math.min(1, a.season.games / 10), data, question: pick(seed, [`Can anyone catch ${surname(a.name)}?`, `Will ${surname(a.name)} still lead this list in March?`]),
          plan: [
            { id: 'fact', kind: 'statement', text: `**${a.name}** averages ${f(a.season[k])} ${w}. Nobody else is above ${f(b.season[k])}.`, chips: [{ key: 'avg', label: 'League average (qualified)', value: r1(m) }, { key: 'games', label: 'Games', value: a.season.games }] },
            { id: 'board', kind: 'board', head: `${W} per game`, sub: `Min. ${minGames(ctx)} games · through round ${ctx.lastRound}`, rows: data.rows.map(r => ({ key: String(r.rank), rank: r.rank, label: r.name, sub: r.teamName, value: r.value, color: r.color })), unit: W === 'PIR' ? 'PIR' : '' },
          ],
          beats: [
            { id: 'hook', scene: 'intro', role: 'hook', text: pick(seed, [`Here is a number that settles an argument.`, `One number says more than any debate.`, `The numbers don't lie, and this one is loud.`]) },
            { id: 'fact', scene: 'fact', role: 'evidence', text: `${a.name} averages ${f(a.season[k])} ${w} per game. Nobody else in the EuroLeague is above ${f(b.season[k])}.` },
            { id: 'avg', scene: 'fact', role: 'narrative', text: `The average among qualified players is ${f(r1(m))}.`, focus: 'avg', minPreset: 'medium' },
            ...data.rows.slice(1).reverse().map(r => ({ id: `r${r.rank}`, scene: 'board', role: 'sequence', text: `${r.rank === 2 ? 'Closest' : `Number ${r.rank}`}: ${r.name}, ${f(r.value)}.`, focus: String(r.rank), minPreset: r.rank > 3 ? 'medium' : 'short' })),
            { id: 'concl', scene: 'board', role: 'conclusion', text: `${surname(a.name)}: ${f(a.season[k])}, in ${pl(a.season.games, 'game')}.`, focus: '1' },
          ],
        });
      }
      return out.sort((x, y) => y.significance - x.significance).slice(0, 3);
    },
  },
  {
    id: 'statistical-twin', number: 2, name: 'Statistical Twin', family: 'statistical', kicker: 'STATISTICAL TWIN',
    description: 'Two players on different teams whose statistical profiles are almost identical.',
    concept: 'Cosine similarity of z-scored per-game profiles (points, rebounds, assists, steals, blocks, 3-point rate, true shooting, minutes).',
    audience: 'Fans who enjoy surprising comparisons; Fantasy players looking for cheaper equivalents',
    durations: D('medium'), aspects: ALL, requires: [{ ...box, min: { players: 100 } }],
    validation: ['both players qualified (minimum games)', 'different teams', 'similarity ≥ 0.90 (cosine)', 'both play 20+ minutes and score 7+ points per game'],
    scriptStructure: ['hook: two names', 'evidence: side-by-side rows', 'sequence: profile radar', 'conclusion: similarity score + price if available', 'question'],
    visual: 'kit: compare → radar → statement', narration: { style: 'analyst', notes: 'Curious, a little playful: "same player, different jersey".' }, frequency: 'weekly', fantasy: true,
    example: '"Same numbers, different jerseys: two forwards with a 97% profile match."', hashtags: ['EuroLeague', 'EuroLeagueFantasy'],
    candidates(ctx) {
      const P = profiles(qualified(ctx).filter(p => p.season.min >= 20 && p.season.pts >= 7)), pairs = [];
      for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
        if (P[i].p.team === P[j].p.team) continue;
        const c = cosine(P[i].z, P[j].z);
        if (c >= 0.9) pairs.push({ a: P[i], b: P[j], c });
      }
      pairs.sort((x, y) => y.c - x.c);
      const used = new Set(), out = [];
      const pctOf = (p, k) => percentile(P.map(x => x.v[k]), p.v[k]);
      for (const { a, b, c } of pairs) {
        if (used.has(a.p.code) || used.has(b.p.code)) continue;
        used.add(a.p.code); used.add(b.p.code);
        const sim = Math.round(c * 100), A = a.p, B = b.p;
        const rows = [['pts', 'Points'], ['reb', 'Rebounds'], ['ast', 'Assists'], ['ts', 'True shooting %'], ['fg3Rate', '3PA share %'], ['min', 'Minutes']].map(([k, l]) => ({ key: k, label: l, a: a.v[k], b: b.v[k] }));
        const keys = ['pts', 'reb', 'ast', 'stl', 'blk', 'ts'];
        const priced = A.price != null && B.price != null;
        const data = { similarity: sim, a: { ...pub(A), ...a.v, price: A.price }, b: { ...pub(B), ...b.v, price: B.price }, rows, radar: { a: Object.fromEntries(keys.map(k => [k, pctOf(a, k)])), b: Object.fromEntries(keys.map(k => [k, pctOf(b, k)])) }, priceGap: priced ? r1(Math.abs(A.price - B.price)) : null };
        const seed = A.code + B.code;
        const cheaper = priced && A.price !== B.price ? (A.price < B.price ? A : B) : null;
        out.push({
          key: `${A.slug}-${B.slug}`, title: `${A.name} and ${B.name}`, sub: `${sim}% profile match`, hook: `${A.name} and ${B.name} are statistical twins`,
          linkPath: '/en/fantasy/compare-players/', entities: { players: [A.code, B.code], teams: [A.team, B.team] }, significance: (c - 0.9) * 10, quality: Math.min(1, Math.min(A.season.games, B.season.games) / 10), data,
          question: pick(seed, [`Who would you rather have: ${surname(A.name)} or ${surname(B.name)}?`, `Did you see this one coming?`]),
          plan: [
            { id: 'cmp', kind: 'compare', a: { name: A.name, sub: A.teamName, color: A.color }, b: { name: B.name, sub: B.teamName, color: B.color }, rows },
            { id: 'radar', kind: 'radar', head: 'League percentile profile', sub: `vs ${P.length} qualified players`, keys, labels: { pts: 'Scoring', reb: 'Rebounding', ast: 'Playmaking', stl: 'Steals', blk: 'Blocks', ts: 'Efficiency' }, series: [{ name: A.name, values: data.radar.a }, { name: B.name, values: data.radar.b }] },
            { id: 'score', kind: 'big', head: 'Profile similarity', value: sim, display: `${sim}%`, label: 'based on 8 per-game stats', cards: priced ? [{ key: 'pa', label: `${surname(A.name)} price`, value: A.price }, { key: 'pb', label: `${surname(B.name)} price`, value: B.price }] : [] },
          ],
          beats: [
            { id: 'hook', scene: 'intro', role: 'hook', text: pick(seed, [`Different teams, different roles on paper. Almost the same numbers.`, `Meet two players the stats can barely tell apart.`]) },
            ...rows.filter(r => ['pts', 'reb', 'ast'].includes(r.key)).map(r => ({ id: `row-${r.key}`, scene: 'cmp', role: 'evidence', text: `${r.label}: ${f(r.a)} for ${surname(A.name)}, ${f(r.b)} for ${surname(B.name)}.`, focus: r.key })),
            { id: 'row-ts', scene: 'cmp', role: 'evidence', text: `True shooting: ${f(a.v.ts)} and ${f(b.v.ts)} percent.`, focus: 'ts', minPreset: 'medium' },
            { id: 'radar', scene: 'radar', role: 'sequence', text: `Against the rest of the league, their shapes almost overlap.`, minPreset: 'medium' },
            { id: 'concl', scene: 'score', role: 'conclusion', text: `Profile similarity: ${sim} percent.${cheaper ? ` And ${surname(cheaper.name)} costs ${f(data.priceGap)} less in Fantasy.` : ''}` },
          ],
        });
        if (out.length >= 3) break;
      }
      return out;
    },
  },
  {
    id: 'stat-paradox', number: 3, name: 'The Stat Paradox', family: 'statistical', kicker: 'THE STAT PARADOX',
    description: 'A team whose record and point differential tell different stories.',
    concept: 'Compare actual wins with Pythagorean expected wins (points for/against, exponent 14). The biggest gap is the paradox.',
    audience: 'Analytics-minded fans', durations: D('short'), aspects: ALL,
    requires: [{ dataset: 'standings', why: 'wins, losses, points for/against' }, { dataset: 'results', why: 'games played', min: { games: 60 } }],
    validation: ['at least 6 games per team', 'gap between actual and expected wins ≥ 1.5'],
    scriptStructure: ['hook: the contradiction', 'evidence: record vs differential', 'conclusion: luck or clutch?', 'question'], visual: 'kit: statement → compare', narration: { style: 'analyst', notes: 'Puzzle tone, then resolve it with the numbers.' }, frequency: 'every 2 weeks',
    example: '"9-4 with a points differential that predicts 7-6."', hashtags: ['EuroLeague', 'Analytics'],
    candidates(ctx) {
      const rows = (ctx.cache.league.stand || []).map(s => { const [, team, w, l, pf, pa] = s, g = w + l; const exp = r1(g * pf ** 14 / (pf ** 14 + pa ** 14)); return { team, w, l, g, pf, pa, diff: pf - pa, exp, gap: r1(w - exp) }; }).filter(x => x.g >= 6);
      return rows.filter(x => Math.abs(x.gap) >= 1.5).sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap)).slice(0, 2).map(t => {
        const over = t.gap > 0, name = teamName(t.team);
        const data = { ...t, name, absDiff: Math.abs(t.diff), diffPerGame: r1(t.diff / t.g), absGap: Math.abs(t.gap), expLosses: r1(t.g - t.exp) };
        return {
          key: t.team.toLowerCase(), title: `${name}: ${t.w}-${t.l}, but…`, sub: `Through round ${ctx.lastRound}`, hook: `${name}'s record and their point differential disagree`, linkPath: '/en/', entities: { players: [], teams: [t.team] },
          significance: Math.min(1, Math.abs(t.gap) / 3), quality: 0.9, data, question: over ? `Clutch, or lucky? What do you think?` : `Is a turnaround coming?`,
          plan: [
            { id: 'st', kind: 'statement', text: `**${name}** are ${t.w}-${t.l}. Their point differential says they "should" be about ${f(t.exp)}-${f(data.expLosses)}.`, chips: [{ key: 'diff', label: 'Point differential', value: t.diff }, { key: 'gap', label: `Wins ${over ? 'above' : 'below'} expectation`, value: data.absGap }] },
            { id: 'cmp', kind: 'compare', a: { name: 'Actual', sub: `${t.w}-${t.l}`, color: teamColor(t.team) }, b: { name: 'Expected', sub: 'from points scored/allowed', color: '#4cc2ff' }, rows: [{ key: 'w', label: 'Wins', a: t.w, b: t.exp }, { key: 'l', label: 'Losses', a: t.l, b: r1(t.g - t.exp), lowerBetter: true }] },
          ],
          beats: [
            { id: 'hook', scene: 'intro', role: 'hook', text: `${name}'s record says one thing. Their scoreboard says another.` },
            { id: 'st', scene: 'st', role: 'narrative', text: `They are ${t.w} and ${t.l}, with a point differential of ${t.diff < 0 ? 'minus' : 'plus'} ${Math.abs(t.diff)}.` },
            { id: 'exp', scene: 'cmp', role: 'evidence', text: `Teams with those points for and against usually win about ${f(t.exp)} of ${t.g} games.`, focus: 'w' },
            { id: 'concl', scene: 'st', role: 'conclusion', text: over ? `That is ${f(data.absGap)} wins more than expected. Close games have gone their way.` : `That is ${f(data.absGap)} wins fewer than expected. Close games have gone against them.`, focus: 'gap' },
          ],
        };
      });
    },
  },
  {
    id: 'statistical-court', number: 4, name: 'The Statistical Court', family: 'statistical', kicker: 'THE STATISTICAL COURT',
    description: 'A player is "on trial": the case for and against, judged on percentiles.',
    concept: 'Prosecution = weakest percentiles, defence = strongest; verdict from the composite.', audience: 'Fans debating overrated/underrated players',
    durations: D('medium'), aspects: ALL, requires: [{ ...box, min: { players: 100 } }],
    validation: ['player qualified', 'at least 3 strengths and 2 weaknesses with ≥ 25 percentile gap'], scriptStructure: ['hook: the charge', 'narrative: prosecution', 'evidence: defence', 'conclusion: verdict', 'question'],
    visual: 'kit: statement → split → radar', narration: { style: 'analyst', notes: 'Courtroom framing, light-hearted.' }, frequency: 'every 2 weeks',
    example: '"The charge: overrated. The evidence: 12th percentile in efficiency…"',
    // builder not implemented yet: data is available (see availability → planned)
  },
  {
    id: 'clutch-report', number: 5, name: 'The Clutch Report', family: 'statistical', kicker: 'THE CLUTCH REPORT',
    description: 'Who delivers when the game is on the line: shooting in clutch time.',
    concept: 'Shots flagged as clutch in the play-by-play shot data (last minutes, close score): attempts and FG% vs the same players outside clutch time.',
    audience: 'Fans of big moments; Fantasy players choosing captains', durations: D('medium'), aspects: ALL,
    requires: [{ dataset: 'shots', why: 'clutch-flagged shots', min: { games: 60 } }, box],
    validation: ['minimum 12 clutch attempts per player', 'shot data must cover at least 60 games'],
    scriptStructure: ['hook', 'evidence: clutch FG% board', 'narrative: compare with their normal FG%', 'conclusion', 'question'], visual: 'kit: board → compare', narration: { style: 'hype', notes: 'Tension, then release on the number.' }, frequency: 'weekly',
    example: '"In clutch time he shoots 58%, eleven points better than the rest of his game."', hashtags: ['EuroLeague', 'Clutch'],
    check(ctx) { const n = ctx.datasets.shots.coverage.games; return n >= 60 ? { ok: true } : { ok: false, reason: `only ${n} games with shot data`, missing: [{ dataset: 'shots', detail: `${n} < 60 games` }] }; },
    candidates(ctx, { minAttempts = 12, count = 5 } = {}) {
      const by = shotsByPlayer(ctx), rows = [];
      for (const [code, shots] of by) {
        const p = ctx.model.byCode.get(code); if (!p) continue;
        const c = shots.filter(s => s.clutch), n = shots.filter(s => !s.clutch);
        if (c.length < minAttempts || n.length < 30) continue;
        const fg = a => r1(100 * a.filter(s => s.made).length / a.length);
        rows.push({ ...pub(p), att: c.length, made: c.filter(s => s.made).length, fg: fg(c), normal: fg(n), delta: r1(fg(c) - fg(n)) });
      }
      if (rows.length < count) return [];
      const top = rows.sort((a, b) => b.fg - a.fg || b.att - a.att).slice(0, count);
      const a = top[0], games = ctx.datasets.shots.coverage.games;
      const data = { rows: top.map((r, i) => ({ rank: i + 1, ...r })), minAttempts, games, leader: a };
      return [{
        key: `clutch-r${ctx.lastRound}`, title: 'Who wants the last shot?', sub: `Clutch-time shooting · ${games} games`, hook: 'The EuroLeague’s best shooters when the game is on the line', linkPath: '/en/shot-charts/',
        entities: { players: top.map(r => r.code), teams: [] }, significance: Math.min(1, Math.max(0, a.delta) / 20 + 0.4), quality: Math.min(1, games / 150), data, question: `Who do you want taking the last shot?`,
        plan: [
          { id: 'board', kind: 'board', head: 'Clutch-time FG%', sub: `Min. ${minAttempts} clutch attempts · ${games} games`, unit: '%', rows: data.rows.map(r => ({ key: String(r.rank), rank: r.rank, label: r.name, sub: `${r.made}/${r.att} · ${r.teamName}`, value: r.fg, color: r.color })) },
          { id: 'cmp', kind: 'compare', a: { name: 'Clutch', sub: a.name, color: a.color }, b: { name: 'Rest of the game', sub: a.name, color: '#4cc2ff' }, rows: [{ key: 'fg', label: 'FG %', a: a.fg, b: a.normal }] },
        ],
        beats: [
          { id: 'hook', scene: 'intro', role: 'hook', text: pick(data.games, [`Last two minutes, one possession game. Who actually delivers?`, `Everyone wants the last shot. Few make it.`]) },
          ...[...data.rows].reverse().map(r => ({ id: `r${r.rank}`, scene: 'board', role: r.rank === 1 ? 'evidence' : 'sequence', text: `${r.rank === 1 ? 'Number one' : `Number ${r.rank}`}: ${r.name}, ${r.made} of ${r.att}, ${f(r.fg)} percent.`, focus: String(r.rank), minPreset: r.rank > 3 ? 'medium' : 'short' })),
          { id: 'cmp', scene: 'cmp', role: 'narrative', text: `Outside clutch time, ${surname(a.name)} shoots ${f(a.normal)} percent.`, focus: 'fg', minPreset: 'medium' },
          { id: 'concl', scene: 'cmp', role: 'conclusion', text: a.delta > 0 ? `When it matters most, he gets ${f(a.delta)} percentage points better.` : `The clutch numbers hold up even against his own standard.` },
        ],
      }];
    },
  },
  {
    id: 'efficiency-trap', number: 6, name: 'The Efficiency Trap', family: 'statistical', kicker: 'THE EFFICIENCY TRAP',
    description: 'High-volume scorers whose shooting efficiency lags the league.',
    concept: 'Players with 10+ field-goal attempts a game ranked by true shooting %, against the qualified average.',
    audience: 'Fans who look beyond points per game; Fantasy players (PIR punishes misses)', durations: D('medium'), aspects: ALL,
    requires: [{ ...box, min: { players: 100 } }], validation: ['10+ FGA per game', 'TS% at least 3 points below the qualified average'],
    scriptStructure: ['hook: points are not everything', 'evidence: lowest TS% among volume shooters', 'conclusion: what it costs in PIR', 'question'], visual: 'kit: statement → board', narration: { style: 'analyst', notes: 'Fair, not mocking; frame as a trade-off.' }, frequency: 'every 2 weeks',
    example: '"He takes 14 shots a game, at 48% true shooting."', hashtags: ['EuroLeague', 'Efficiency'],
    candidates(ctx, { minFga = 10, count = 4 } = {}) {
      const Q = qualified(ctx).map(p => ({ p, v: perGame(p) })), avg = r1(mean(Q.map(x => x.v.ts).filter(Number.isFinite)));
      const vol = Q.filter(x => x.v.fga >= minFga && x.v.ts != null && x.v.ts <= avg - 3).sort((a, b) => a.v.ts - b.v.ts).slice(0, count);
      if (vol.length < 3) return [];
      const rows = vol.map((x, i) => ({ rank: i + 1, ...pub(x.p), ts: x.v.ts, fga: x.v.fga, pts: x.v.pts }));
      const a = rows[0];
      return [{
        key: `trap-r${ctx.lastRound}`, title: 'Points are not everything', sub: `True shooting % · ${minFga}+ shots a game`, hook: 'High volume, low efficiency: the EuroLeague’s efficiency traps', linkPath: '/en/leaders/',
        entities: { players: rows.map(r => r.code), teams: [] }, significance: Math.min(1, (avg - a.ts) / 10), quality: 0.85, data: { rows, avg, minFga, gap: r1(avg - a.ts) }, question: 'Volume or efficiency: which matters more to you?',
        plan: [
          { id: 'st', kind: 'statement', text: `The qualified average true shooting is **${f(avg)}%**.`, chips: [{ key: 'fga', label: 'Shot volume filter', value: minFga, unit: '+ FGA' }] },
          { id: 'board', kind: 'board', head: 'Lowest true shooting %', sub: `${minFga}+ field-goal attempts per game`, unit: 'TS%', rows: rows.map(r => ({ key: String(r.rank), rank: r.rank, label: r.name, sub: `${f(r.pts)} pts · ${f(r.fga)} FGA`, value: r.ts, color: r.color })) },
        ],
        beats: [
          { id: 'hook', scene: 'intro', role: 'hook', text: `Big scoring numbers can hide an expensive habit.` },
          { id: 'avg', scene: 'st', role: 'narrative', text: `Across qualified players, true shooting averages ${f(avg)} percent.` },
          ...rows.map(r => ({ id: `r${r.rank}`, scene: 'board', role: 'evidence', text: `${r.name}: ${f(r.fga)} shots a game at ${f(r.ts)} percent.`, focus: String(r.rank), minPreset: r.rank > 2 ? 'medium' : 'short' })),
          { id: 'concl', scene: 'board', role: 'conclusion', text: `${surname(a.name)} sits ${f(r1(avg - a.ts))} percentage points below average. In PIR, every miss counts against you.`, focus: '1' },
        ],
      }];
    },
  },
  {
    id: 'shot-diet', number: 7, name: 'The Shot Diet', family: 'statistical', kicker: 'THE SHOT DIET',
    description: 'Where a player takes his shots, zone by zone, against the league.',
    concept: 'Shot-location data aggregated into 8 zones; the player whose diet differs most from the league average.',
    audience: 'Tactics fans and coaches', durations: D('medium'), aspects: ['9x16', '1x1', '16x9'],
    requires: [{ dataset: 'shots', why: 'shot locations by zone', min: { games: 40 } }, box], validation: ['at least 100 shots for the player', 'zones from official coordinates'],
    scriptStructure: ['hook', 'sequence: court map', 'evidence: zone shares vs league', 'conclusion', 'question'], visual: 'kit: court → split', narration: { style: 'analyst', notes: 'Explain like a coach at a whiteboard.' }, frequency: 'weekly',
    example: '"62% of his shots come at the rim. The league average is 31%."', hashtags: ['EuroLeague', 'ShotChart'],
    candidates(ctx, { minShots = 100 } = {}) {
      const by = shotsByPlayer(ctx), all = [...by.values()].flat(), lg = zoneProfile(all);
      const group = z => ({ inside: (z.rim?.share || 0) + (z.paint?.share || 0), mid: z.mid?.share || 0, three: ['c3l', 'c3r', 'w3l', 'w3r', 'top3'].reduce((a, k) => a + (z[k]?.share || 0), 0) });
      const L = group(lg), out = [];
      for (const [code, shots] of by) {
        if (shots.length < minShots) continue;
        const p = ctx.model.byCode.get(code); if (!p) continue;
        const z = zoneProfile(shots), G = group(z), dist = Math.abs(G.inside - L.inside) + Math.abs(G.mid - L.mid) + Math.abs(G.three - L.three);
        out.push({ p, z, G: { inside: r1(G.inside), mid: r1(G.mid), three: r1(G.three) }, dist, n: shots.length });
      }
      out.sort((a, b) => b.dist - a.dist);
      const Lr = { inside: r1(L.inside), mid: r1(L.mid), three: r1(L.three) };
      return out.slice(0, 3).map(({ p, z, G, dist, n }) => {
        const big = Object.entries(G).sort((a, b) => Math.abs(b[1] - Lr[b[0]]) - Math.abs(a[1] - Lr[a[0]]))[0][0];
        const label = { inside: 'at the rim and in the paint', mid: 'from mid-range', three: 'from three' }[big];
        const topZone = Object.entries(z).sort((a, b) => b[1].att - a[1].att)[0][0];
        const data = { player: pub(p), shots: n, zones: z, groups: G, league: Lr, focus: big, topZone };
        return {
          key: p.slug, title: `${p.name}'s shot diet`, sub: `${n} shots · ${p.teamName}`, hook: `Where ${p.name} really shoots from`, linkPath: `/en/player/${p.slug}/`, entities: { players: [p.code], teams: [p.team] },
          significance: Math.min(1, dist / 60), quality: Math.min(1, n / 200), data, question: `Should ${surname(p.name)} change his diet?`,
          plan: [
            { id: 'court', kind: 'court', head: `${p.name}`, sub: `Share of shots by zone · FG% · ${n} shots`, zones: z },
            { id: 'split', kind: 'split', head: 'Shot diet vs league', sub: 'Share of field-goal attempts', rows: [{ key: 'p', label: p.name, display: `${f(G.inside)} / ${f(G.mid)} / ${f(G.three)}`, parts: [{ value: G.inside, color: '#e4572e', text: `${Math.round(G.inside)}%` }, { value: G.mid, color: '#ffb347', text: `${Math.round(G.mid)}%` }, { value: G.three, color: '#4cc2ff', text: `${Math.round(G.three)}%` }] }, { key: 'l', label: 'League', display: `${f(Lr.inside)} / ${f(Lr.mid)} / ${f(Lr.three)}`, parts: [{ value: Lr.inside, color: '#e4572e', text: `${Math.round(Lr.inside)}%` }, { value: Lr.mid, color: '#ffb347', text: `${Math.round(Lr.mid)}%` }, { value: Lr.three, color: '#4cc2ff', text: `${Math.round(Lr.three)}%` }] }], legend: [{ label: 'Rim + paint', color: '#e4572e' }, { label: 'Mid-range', color: '#ffb347' }, { label: 'Three', color: '#4cc2ff' }] },
          ],
          beats: [
            { id: 'hook', scene: 'intro', role: 'hook', text: `Every shooter has a menu. Here is ${surname(p.name)}'s.` },
            { id: 'court', scene: 'court', role: 'sequence', text: `${n} shots this season, mapped zone by zone.` },
            { id: 'zone', scene: 'court', role: 'narrative', text: `His busiest zone: ${ZONE_LABEL[data.topZone].toLowerCase()}, where he takes ${f(z[data.topZone].share)} percent of his shots and makes ${f(z[data.topZone].fg)} percent.`, minPreset: 'medium' },
            { id: 'p', scene: 'split', role: 'evidence', text: `${f(G[big])} percent of his shots come ${label}.`, focus: 'p' },
            { id: 'l', scene: 'split', role: 'evidence', text: `The league average is ${f(Lr[big])} percent.`, focus: 'l' },
            { id: 'concl', scene: 'split', role: 'conclusion', text: G[big] > Lr[big] ? `That is a specialist's diet, and defences know it.` : `He avoids what most of the league lives on.` },
          ],
        };
      });
    },
  },
  {
    id: 'prediction-vs-reality', number: 8, name: 'Prediction vs Reality', family: 'statistical', kicker: 'PREDICTION VS REALITY',
    description: "How the basketballstats.eu match model's pre-game probabilities compared with what happened.",
    concept: 'Logged win probabilities (before tip-off) against results: accuracy, favourites, and the biggest upset.',
    audience: 'Fans and bettors interested in model transparency', durations: D('short'), aspects: ALL,
    requires: [{ dataset: 'matchPredictions', why: 'logged pre-game probabilities', min: { games: 20 } }, { dataset: 'results', why: 'actual results' }],
    validation: ['only predictions logged before the game', 'at least 20 settled games'], scriptStructure: ['hook', 'evidence: accuracy', 'sequence: favourites', 'narrative: biggest upset', 'conclusion', 'question'],
    visual: 'kit: big → split → statement', narration: { style: 'analyst', notes: 'Transparent and honest, including misses.' }, frequency: 'weekly (after each round)',
    example: '"The model called 41 of 60 games. Its biggest miss: a 78% favourite."', hashtags: ['EuroLeague', 'Predictions'],
    candidates(ctx) {
      const R = predictionsVsResults(ctx);
      if (R.length < 20) return [];
      const ok = R.filter(r => r.correct).length, acc = Math.round(100 * ok / R.length);
      const fav = R.filter(r => r.favProb >= 0.65), favOk = fav.filter(r => r.correct).length;
      const up = R.filter(r => !r.correct).sort((a, b) => b.favProb - a.favProb)[0];
      const upFav = up.p >= 0.5 ? up.home : up.away, upDog = up.p >= 0.5 ? up.away : up.home, upPct = Math.round(up.favProb * 100);
      const data = { threshold: 65, games: R.length, correct: ok, accuracy: acc, strong: fav.length, strongCorrect: favOk, strongPct: fav.length ? Math.round(100 * favOk / fav.length) : 0, upset: { ...up, fav: upFav, favName: teamName(upFav), dog: upDog, dogName: teamName(upDog), pct: upPct, rounds: [R[0].round, R.at(-1).round] } };
      return [{
        key: `pvr-r${ctx.lastRound}`, title: 'Prediction vs reality', sub: `Rounds ${R[0].round}–${R.at(-1).round} · ${R.length} games`, hook: `How our match model did: ${ok} of ${R.length}`, linkPath: '/en/predictions/',
        entities: { players: [], teams: [upFav, upDog] }, significance: 0.6, quality: Math.min(1, R.length / 60), data, question: 'Which result surprised you most this season?',
        plan: [
          { id: 'acc', kind: 'big', head: 'Model accuracy', value: acc, display: `${acc}%`, label: `${ok} of ${R.length} winners called`, cards: [{ key: 'n', label: 'Games', value: R.length }, { key: 'ok', label: 'Correct', value: ok }] },
          { id: 'fav', kind: 'split', head: 'When the model was confident', sub: '65%+ favourites', rows: [{ key: 'strong', label: `${fav.length} strong favourites`, display: `${favOk} won`, parts: [{ value: favOk, color: '#2fae66', text: `${favOk} won` }, { value: fav.length - favOk, color: '#e5484d', text: `${fav.length - favOk} lost` }] }] },
          { id: 'up', kind: 'statement', text: `Biggest miss: **${teamName(upFav)}** were ${upPct}% favourites against ${teamName(upDog)} in round ${up.round}.`, chips: [{ key: 'score', label: 'Final score', value: `${up.hs}-${up.as}` }] },
        ],
        beats: [
          { id: 'hook', scene: 'intro', role: 'hook', text: `We publish win probabilities before every game. Here is how they held up.` },
          { id: 'acc', scene: 'acc', role: 'evidence', text: `The model picked the winner in ${ok} of ${R.length} games: ${acc} percent.` },
          { id: 'fav', scene: 'fav', role: 'sequence', text: `When it gave a team 65 percent or more, that team won ${favOk} of ${fav.length}.`, focus: 'strong', minPreset: 'medium' },
          { id: 'up', scene: 'up', role: 'narrative', text: `The biggest miss: ${teamName(upFav)}, ${upPct} percent favourites, lost to ${teamName(upDog)}.` },
          { id: 'concl', scene: 'up', role: 'conclusion', text: `Probabilities are not promises. That is the point of measuring them.` },
        ],
      }];
    },
  },
];
