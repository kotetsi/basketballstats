import { f, pl, pick, surname, list, r1, ORD } from '../editorial.mjs';
import { qualified, pub, perGame } from '../stats.mjs';

// Family C: interactive content. Questions are answered with data on screen; votes go to comments.

const D = (recommended, supported = ['short', 'medium', 'long']) => ({ recommended, supported });
const ALL = ['9x16', '16x9', '1x1'];
const box = { dataset: 'boxscores', why: 'season averages' };
const stars = (ctx, n = 40) => [...qualified(ctx)].sort((a, b) => b.season.pir - a.season.pir).slice(0, n);
const COUNTRY = { 'United States of America': 'United States', 'Serbia': 'Serbia', 'Greece': 'Greece', 'Spain': 'Spain', 'France': 'France', 'Turkey': 'Turkey', 'Lithuania': 'Lithuania', 'Israel': 'Israel', 'Italy': 'Italy', 'Germany': 'Germany' };
const M = { pir: 'PIR', pts: 'points', reb: 'rebounds', ast: 'assists' };

export default [
  {
    id: 'guess-the-player', number: 16, name: 'Guess the Player', family: 'interactive', kicker: 'GUESS THE PLAYER',
    description: 'Clues revealed one by one, from bio to stat line; the name comes last.',
    concept: 'A top-40 player by PIR; clues use position, height, country, age and season averages; team and name are revealed at the end.',
    audience: 'All fans; high comment potential', durations: D('short'), aspects: ALL,
    requires: [box, { dataset: 'bio', why: 'height, country, age, position' }], validation: ['player must be top-40 by PIR (recognisable)', 'bio fields present', 'clues must not contain the name or team'],
    scriptStructure: ['hook: the challenge', 'sequence: 4 clues', 'evidence: stat line clue', 'conclusion: reveal', 'question: did you get it?'], visual: 'kit: clues (reveal)', narration: { style: 'energetic', notes: 'Game-show pacing; pause before the reveal.' }, frequency: '2 per week',
    example: '"Clue 1: forward, 2.03 m. Clue 2: from Bulgaria…"', hashtags: ['EuroLeague', 'GuessThePlayer'],
    candidates(ctx, { count = 3 } = {}) {
      const raw = ctx.rawPlayer();
      const pool = stars(ctx).filter(p => { const r = raw.get(p.code); return r?.h && r?.ct && r?.age; });
      const seed = ctx.lastRound;
      const chosen = [...pool].sort((a, b) => ((a.code.charCodeAt(5) * 31 + seed) % 97) - ((b.code.charCodeAt(5) * 31 + seed) % 97)).slice(0, count);
      return chosen.map(p => {
        const r = raw.get(p.code), h = r.h / 100, s = p.season, country = COUNTRY[r.ct] || r.ct;
        const clues = [
          { key: 'c1', text: `${p.pos || 'Player'}, ${h.toFixed(2)} m` },
          { key: 'c2', text: `Nationality: ${country}${r.age ? ` · ${r.age} years old` : ''}` },
          { key: 'c3', text: `${f(s.pts)} points, ${f(s.reb)} rebounds, ${f(s.ast)} assists a game` },
          { key: 'c4', text: `${f(s.pir)} PIR in ${pl(s.games, 'game')} this season` },
        ];
        if (clues.some(c => c.text.includes(p.name.split(' ').at(-1)) || c.text.includes(p.teamName))) return null;
        return {
          key: p.slug, title: 'Guess the player', sub: '4 clues · answer at the end', hook: 'Four clues. One EuroLeague player. Can you guess him?', linkPath: `/en/player/${p.slug}/`,
          entities: { players: [p.code], teams: [p.team] }, significance: 0.55, quality: 0.9, data: { player: pub(p), height: Number(h.toFixed(2)), heightCm: r.h, age: r.age, country, season: s },
          question: 'Did you get it before the last clue?',
          plan: [{ id: 'clues', kind: 'clues', head: 'Who is he?', clues, answer: { label: p.name, sub: p.teamName } }],
          beats: [
            { id: 'hook', scene: 'intro', role: 'hook', text: pick(p.code, [`Four clues. One EuroLeague player. Lock in your answer.`, `Guess the player before we tell you.`]) },
            { id: 'c1', scene: 'clues', role: 'sequence', text: `Clue one: ${p.pos ? p.pos.toLowerCase() : 'player'}, ${h.toFixed(2)} metres tall.`, focus: 'c1' },
            { id: 'c2', scene: 'clues', role: 'sequence', text: `Clue two: nationality ${country.replace(/^the /, '')}, ${r.age} years old.`, focus: 'c2' },
            { id: 'c3', scene: 'clues', role: 'evidence', text: `Clue three: ${f(s.pts)} points, ${f(s.reb)} rebounds and ${f(s.ast)} assists a game.`, focus: 'c3' },
            { id: 'c4', scene: 'clues', role: 'evidence', text: `Clue four: ${f(s.pir)} PIR this season.`, focus: 'c4' },
            { id: 'reveal', scene: 'clues', role: 'conclusion', text: `It's ${p.name} of ${p.teamName}.`, focus: 'reveal' },
          ],
        };
      }).filter(Boolean);
    },
  },
  {
    id: 'basketball-iq-test', number: 17, name: 'Basketball IQ Test', family: 'interactive', kicker: 'BASKETBALL IQ TEST',
    description: 'Three quick data questions: who has more, which is higher. Score yourself.',
    concept: 'Pairs of well-known players with close but different season averages; the answer is revealed with both values.',
    audience: 'Fans who like quizzes', durations: D('medium'), aspects: ALL, requires: [box],
    validation: ['values must differ (no ties)', 'difference small enough to be a real question (≤ 25%)'], scriptStructure: ['hook', 'sequence: question 1-3', 'evidence: reveals with values', 'conclusion: score yourself', 'question'],
    visual: 'kit: question ×3', narration: { style: 'energetic', notes: 'Quiz host.' }, frequency: 'weekly',
    example: '"Question one: who averages more assists, Nunn or Larkin?"', hashtags: ['EuroLeague', 'Quiz'],
    candidates(ctx) {
      const S = stars(ctx, 30), qs = [], used = new Set();
      for (const k of ['ast', 'reb', 'pts']) {
        for (let i = 0; i < S.length && qs.filter(q => q.k === k).length < 1; i++) for (let j = i + 1; j < S.length; j++) {
          const a = S[i], b = S[j]; if (used.has(a.code) || used.has(b.code) || a.team === b.team) continue;
          const va = a.season[k], vb = b.season[k]; if (va === vb || Math.abs(va - vb) / Math.max(va, vb) > 0.25 || Math.abs(va - vb) < 0.3) continue;
          qs.push({ k, a, b, va, vb, win: va > vb ? 'a' : 'b' }); used.add(a.code); used.add(b.code); break;
        }
      }
      if (qs.length < 3) return [];
      const plan = qs.map((q, i) => ({ id: `q${i + 1}`, kind: 'question', prompt: `Q${i + 1}. Who averages more ${M[q.k]}?`, answer: q.win, countdown: true, options: [{ key: 'a', label: q.a.name, sub: q.a.teamName, reveal: q.va }, { key: 'b', label: q.b.name, sub: q.b.teamName, reveal: q.vb }] }));
      return [{
        key: `iq-r${ctx.lastRound}`, title: 'Basketball IQ test', sub: '3 questions · keep score', hook: 'Three EuroLeague questions. How many can you get?', linkPath: '/en/quiz/',
        entities: { players: qs.flatMap(q => [q.a.code, q.b.code]), teams: [] }, significance: 0.5, quality: 0.9, data: { questions: qs.map(q => ({ metric: q.k, a: pub(q.a), b: pub(q.b), va: q.va, vb: q.vb, winner: q.win })) },
        question: 'How many did you get right? Tell us in the comments.',
        plan,
        beats: [
          { id: 'hook', scene: 'intro', role: 'hook', text: `Three questions. No guessing allowed. Keep score.` },
          ...qs.flatMap((q, i) => [
            { id: `q${i + 1}`, scene: `q${i + 1}`, role: 'sequence', text: `Question ${ORD[i + 1]}: who averages more ${M[q.k]}, ${surname(q.a.name)} or ${surname(q.b.name)}?` },
            { id: `a${i + 1}`, scene: `q${i + 1}`, role: 'evidence', text: `${q.win === 'a' ? surname(q.a.name) : surname(q.b.name)}: ${f(q.win === 'a' ? q.va : q.vb)} against ${f(q.win === 'a' ? q.vb : q.va)}.`, focus: 'reveal' },
          ]),
          { id: 'concl', scene: 'q3', role: 'conclusion', text: `Three out of three? That is a EuroLeague brain.`, focus: 'reveal' },
        ],
      }];
    },
  },
  {
    id: 'who-would-you-pick', number: 18, name: 'Who Would You Pick?', family: 'interactive', kicker: 'WHO WOULD YOU PICK?',
    description: 'Two Fantasy options at nearly the same price; the numbers, then your vote.',
    concept: 'Pairs of qualified players within 1.0 credit of each other, compared on PIR, recent form and next-round projection.',
    audience: 'EuroLeague Fantasy managers', durations: D('short'), aspects: ALL,
    requires: [box, { dataset: 'fantasyPrices', why: 'prices' }, { dataset: 'projections', why: 'next-round PIR projection' }], validation: ['price gap ≤ 1.0', 'both have a projection', 'no answer given: it is a vote'],
    scriptStructure: ['hook', 'evidence: price + PIR', 'narrative: form and projection', 'conclusion: the trade-off', 'question: vote'], visual: 'kit: compare → question', narration: { style: 'energetic', notes: 'Neutral; let the audience decide.' }, frequency: 'every round', fantasy: true, gameDay: true,
    example: '"Both cost 15. One projects 18 PIR, the other is hotter right now."', hashtags: ['EuroLeagueFantasy', 'Fantasy'],
    candidates(ctx, { maxGap = 1.0 } = {}) {
      const P = stars(ctx, 60).filter(p => p.price != null && p.projection?.pir != null), out = [];
      const l5 = p => r1(p.games.slice(-5).reduce((a, g) => a + g.pir, 0) / Math.min(5, p.games.length));
      for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
        const a = P[i], b = P[j]; if (a.team === b.team || Math.abs(a.price - b.price) > maxGap) continue;
        const fa = l5(a), fb = l5(b);
        if ((fa > fb) === (a.projection.pir > b.projection.pir)) continue; // a real dilemma: form and projection disagree
        out.push({ a, b, fa, fb });
      }
      return out.sort((x, y) => (y.a.price + y.b.price) - (x.a.price + x.b.price)).slice(0, 3).map(({ a, b, fa, fb }) => {
        const rows = [{ key: 'price', label: 'Price', a: a.price, b: b.price, lowerBetter: true }, { key: 'pir', label: 'Season PIR', a: a.season.pir, b: b.season.pir }, { key: 'form', label: 'Last 5 PIR', a: fa, b: fb }, { key: 'proj', label: `R${ctx.nextRound} projection`, a: a.projection.pir, b: b.projection.pir }];
        const hot = fa > fb ? a : b, proj = a.projection.pir > b.projection.pir ? a : b;
        return {
          key: `${a.slug}-${b.slug}`, title: `${surname(a.name)} or ${surname(b.name)}?`, sub: `Round ${ctx.nextRound} · Fantasy`, hook: `${a.name} or ${b.name} for round ${ctx.nextRound}?`, linkPath: '/en/fantasy/compare-players/',
          entities: { players: [a.code, b.code], teams: [a.team, b.team] }, significance: 0.6, quality: 0.85, fantasy: true,
          data: { round: ctx.nextRound, a: { ...pub(a), price: a.price, pir: a.season.pir, form: fa, proj: a.projection.pir }, b: { ...pub(b), price: b.price, pir: b.season.pir, form: fb, proj: b.projection.pir }, last: 5 },
          question: `${surname(a.name)} or ${surname(b.name)}: who are you picking?`,
          plan: [
            { id: 'cmp', kind: 'compare', a: { name: a.name, sub: a.teamName, color: a.color }, b: { name: b.name, sub: b.teamName, color: b.color }, rows },
            { id: 'vote', kind: 'question', prompt: `Round ${ctx.nextRound}: who would you pick?`, answer: null, options: [{ key: 'a', label: a.name, sub: `${f(a.price)} credits` }, { key: 'b', label: b.name, sub: `${f(b.price)} credits` }] },
          ],
          beats: [
            { id: 'hook', scene: 'intro', role: 'hook', text: pick(a.code + b.code, [`Same budget, one spot. Who gets it?`, `Two players, almost the same price. Your call.`]) },
            { id: 'price', scene: 'cmp', role: 'evidence', text: `${surname(a.name)} costs ${f(a.price)}, ${surname(b.name)} ${f(b.price)}.`, focus: 'price' },
            { id: 'pir', scene: 'cmp', role: 'evidence', text: `Season PIR: ${f(a.season.pir)} against ${f(b.season.pir)}.`, focus: 'pir', minPreset: 'medium' },
            { id: 'form', scene: 'cmp', role: 'narrative', text: `${surname(hot.name)} is hotter: ${f(Math.max(fa, fb))} PIR over the last 5.`, focus: 'form' },
            { id: 'proj', scene: 'cmp', role: 'narrative', text: `But the model projects ${surname(proj.name)} higher this round: ${f(proj.projection.pir)}.`, focus: 'proj' },
            { id: 'concl', scene: 'vote', role: 'conclusion', text: `Form or projection. There is no wrong answer, only a choice.` },
          ],
        };
      });
    },
  },
  {
    id: 'rank-these-players', number: 19, name: 'Rank These Players', family: 'interactive', kicker: 'RANK THESE PLAYERS',
    description: 'Four players, one stat: rank them, then see the real order.',
    concept: 'Four recognisable players with distinct values in one metric; the board reveals the order bottom-up.',
    audience: 'All fans', durations: D('short'), aspects: ALL, requires: [box], validation: ['four players from four different teams', 'values strictly different'],
    scriptStructure: ['hook: the four names', 'sequence: pause to rank', 'evidence: reveal 4 to 1', 'conclusion', 'question'], visual: 'kit: question → board', narration: { style: 'energetic', notes: 'Challenge the viewer.' }, frequency: 'weekly',
    example: '"Rank them by PIR: Vezenkov, Nunn, Hifi, Shorts."', hashtags: ['EuroLeague', 'RankThem'],
    candidates(ctx) {
      const S = stars(ctx, 24), out = [];
      for (const k of ['pir', 'pts', 'ast']) {
        const pool = [], teams = new Set();
        for (const p of S.filter((_, i) => i % 3 === ['pir', 'pts', 'ast'].indexOf(k))) { if (teams.has(p.team) || pool.some(x => x.season[k] === p.season[k])) continue; pool.push(p); teams.add(p.team); if (pool.length === 4) break; }
        if (pool.length < 4) continue;
        const order = [...pool].sort((a, b) => b.season[k] - a.season[k]);
        out.push({
          key: `${k}-${pool.map(p => p.slug.split('-').at(-1)).join('-')}`, title: `Rank them by ${M[k]}`, sub: 'Pause and decide', hook: `Rank these four by ${M[k]}`, linkPath: '/en/leaders/',
          entities: { players: pool.map(p => p.code), teams: [...teams] }, significance: 0.5, quality: 0.9, data: { metric: k, players: order.map((p, i) => ({ rank: i + 1, ...pub(p), value: p.season[k] })) },
          question: 'How close was your order?',
          plan: [
            { id: 'ask', kind: 'question', prompt: `Rank them by ${M[k]} per game`, answer: null, options: pool.map((p, i) => ({ key: String(i), label: p.name, sub: p.teamName })) },
            { id: 'board', kind: 'board', head: `${M[k] === 'PIR' ? 'PIR' : M[k][0].toUpperCase() + M[k].slice(1)} per game`, sub: 'The real order', rows: order.map((p, i) => ({ key: String(i + 1), rank: i + 1, label: p.name, sub: p.teamName, value: p.season[k], color: p.color })) },
          ],
          beats: [
            { id: 'hook', scene: 'intro', role: 'hook', text: `Four players. Rank them by ${M[k]}. Go.` },
            { id: 'ask', scene: 'ask', role: 'sequence', text: `${list(pool.map(p => surname(p.name)))}. Pause the video and make your list.` },
            ...[4, 3, 2].map(r => ({ id: `r${r}`, scene: 'board', role: 'evidence', text: `Number ${r}: ${order[r - 1].name}, ${f(order[r - 1].season[k])}.`, focus: String(r) })),
            { id: 'concl', scene: 'board', role: 'conclusion', text: `And on top: ${order[0].name}, ${f(order[0].season[k])}.`, focus: '1' },
          ],
        });
      }
      return out;
    },
  },
  {
    id: 'data-challenge', number: 20, name: 'The Data Challenge', family: 'interactive', kicker: 'THE DATA CHALLENGE',
    description: 'A statistical club with very few members: can you name them?',
    concept: 'Find thresholds on two stats that only 2–4 qualified players meet; reveal the members.',
    audience: 'Hardcore fans', durations: D('short'), aspects: ALL, requires: [box], validation: ['2 to 4 members', 'thresholds are round numbers'],
    scriptStructure: ['hook: the club', 'sequence: thinking time', 'evidence: the members', 'conclusion', 'question'], visual: 'kit: statement → board', narration: { style: 'energetic', notes: 'Trivia tone.' }, frequency: 'weekly',
    example: '"Only 3 players average 12+ points and 5+ assists. Name them."', hashtags: ['EuroLeague', 'Trivia'],
    candidates(ctx) {
      const Q = qualified(ctx), out = [];
      const combos = [['pts', 'ast', [10, 12, 14, 16], [4, 5, 6]], ['pts', 'reb', [10, 12, 14, 16], [5, 6, 7, 8]], ['reb', 'ast', [5, 6, 7], [3, 4, 5]]];
      for (const [k1, k2, T1, T2] of combos) for (const t1 of T1) for (const t2 of T2) {
        const m = Q.filter(p => p.season[k1] >= t1 && p.season[k2] >= t2);
        if (m.length >= 2 && m.length <= 4 && !out.some(o => o.k1 === k1 && o.k2 === k2)) out.push({ k1, k2, t1, t2, m });
      }
      return out.slice(0, 3).map(({ k1, k2, t1, t2, m }) => {
        const n = m.length, rows = m.sort((a, b) => b.season[k1] - a.season[k1]).map((p, i) => ({ rank: i + 1, ...pub(p), v1: p.season[k1], v2: p.season[k2] }));
        return {
          key: `${k1}${t1}-${k2}${t2}`, title: `Only ${ORD[n]} players…`, sub: `${t1}+ ${M[k1]} and ${t2}+ ${M[k2]} a game`, hook: `Only ${n} EuroLeague players average ${t1}+ ${M[k1]} and ${t2}+ ${M[k2]}`, linkPath: '/en/leaders/',
          entities: { players: m.map(p => p.code), teams: [] }, significance: 0.6, quality: 0.85, data: { k1, k2, t1, t2, n, rows },
          question: `How many did you name?`,
          plan: [
            { id: 'club', kind: 'statement', kicker: 'NAME THEM', text: `Only **${n}** players average **${t1}+ ${M[k1]}** and **${t2}+ ${M[k2]}** a game.` },
            { id: 'board', kind: 'board', head: 'The members', sub: `${M[k1]} · ${M[k2]}`, rows: rows.map(r => ({ key: String(r.rank), rank: r.rank, label: r.name, sub: `${f(r.v2)} ${M[k2]} · ${r.teamName}`, value: r.v1, unit: M[k1], color: r.color })) },
          ],
          beats: [
            { id: 'hook', scene: 'intro', role: 'hook', text: `A challenge for real EuroLeague fans.` },
            { id: 'club', scene: 'club', role: 'sequence', text: `Only ${n} players average at least ${t1} ${M[k1]} and ${t2} ${M[k2]}. Name them. Five seconds.` },
            ...rows.map(r => ({ id: `r${r.rank}`, scene: 'board', role: 'evidence', text: `${r.name}: ${f(r.v1)} and ${f(r.v2)}.`, focus: String(r.rank) })),
            { id: 'concl', scene: 'board', role: 'conclusion', text: `That's the whole club.` },
          ],
        };
      });
    },
  },
  {
    id: 'agree-or-disagree', number: 21, name: 'Agree or Disagree?', family: 'interactive', kicker: 'AGREE OR DISAGREE?',
    description: 'A popular claim tested against the data; the audience votes, then the verdict.',
    concept: 'Editor-supplied claim (e.g. from social media) checked against a computable statistic.',
    audience: 'Fans in debates', durations: D('short'), aspects: ALL,
    requires: [box, { dataset: 'editorialClaims', why: 'approved claims to test (editor input)' }],
    validation: ['claim must map to a computable statistic', 'verdict only from data'], scriptStructure: ['hook: the claim', 'question: vote', 'evidence', 'conclusion: verdict', 'question'],
    visual: 'kit: statement → question → compare', narration: { style: 'analyst', notes: 'Fair-minded referee.' }, frequency: 'weekly',
    example: '"Claim: Real Madrid are better at home. Verdict: true, 6-0 vs 1-6."',
  },
];
