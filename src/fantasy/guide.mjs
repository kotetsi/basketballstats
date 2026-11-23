// Κεντρικός οδηγός EuroLeague Fantasy (pillar για «euroleague fantasy»), ελληνικά και αγγλικά.
// Οι κανόνες έρχονται από το CLASSIC_RULES (src/fantasy/rules.mjs) και το fantasy/official/calendar.json,
// τα ζωντανά νούμερα (τιμές, αξία, επόμενο παράθυρο αλλαγών) από το data/fantasy/latest.json.
import { CLASSIC_RULES, FORMATIONS } from './rules.mjs';

const fmt1 = x => (Math.round(x * 10) / 10).toFixed(1);

/** επόμενο (ή τρέχον) παράθυρο απεριόριστων αλλαγών μετά από σήμερα */
export function nextUnlimited(calendar, today) {
  const w = (calendar?.unlimited_after || []).find(x => x.to >= today);
  return w ? { before: w.round + 1, from: w.from, to: w.to, open: w.from <= today } : null;
}

/** αλλαγή τιμής μετά από αγωνιστική, με το μοντέλο του fantasy/official/price-model.json */
export function priceChange(points, price, model) {
  const raw = (model?.slope ?? 0.036) * (points - price);
  return Math.round(raw * 10) / 10;
}

/**
 * h: { LG, esc, url(key), name(c), team(code), slug(c), FXD, calendar, priceModel, today, season, siteName }
 * επιστρέφει { title, desc, h1, main, faq } ή null για τις γλώσσες που κρατούν τη σύντομη εκδοχή
 */
export function fantasyGuide(h) {
  const { LG, esc, url, name, team, slug, FXD, calendar, priceModel, today, season } = h;
  if (LG !== 'el' && LG !== 'en') return null;
  const E = LG === 'en';
  const t = (el, en) => (E ? en : el);
  const R = CLASSIC_RULES;
  const loc = E ? 'en-GB' : 'el-GR';
  const dTxt = d => new Date(d + 'T12:00:00Z').toLocaleDateString(loc, { day: 'numeric', month: 'long' });
  const P = (FXD?.players || []).filter(x => x.price > 0 && x.price_src === 'official');
  const round = FXD?.round;
  const posT = { Guard: t('Γκαρντ', 'Guard'), Forward: t('Φόργουορντ', 'Forward'), Center: t('Σέντερ', 'Center') };
  const pl = x => `<a href="${url('player:' + slug(x.c))}">${esc(name(x.c))}</a>`;
  const withS = x => (slug(x.c) ? x : null);

  // ζωντανά νούμερα
  const top = P.slice().sort((a, b) => b.price - a.price).slice(0, 5).map(withS).filter(Boolean);
  const value = P.filter(x => x.pp >= 8 && x.status !== 'injured' && x.status !== 'out').map(x => ({ ...x, v: x.pp / x.price })).sort((a, b) => b.v - a.v).slice(0, 5).map(withS).filter(Boolean);
  const nu = nextUnlimited(calendar, today);
  const ex = { price: 10, pts: 20 }; ex.d = priceChange(ex.pts, ex.price, priceModel);
  const dnp = Math.abs((priceModel?.dnp_ratio ?? -0.012) * 100).toFixed(1).replace('.', E ? '.' : ',');
  const floor = fmt1(priceModel?.floor ?? 4).replace('.', E ? '.' : ',');
  const cs = R.coachScoring;

  const tbl = (rows, head) => `<div class="tbl"><table><thead><tr>${head.map((x, i) => `<th${i < 2 ? ' class="l"' : ''}>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
  const topT = top.length ? tbl(top.map(x => `<tr><td class="l">${pl(x)}</td><td class="l">${esc(team(x.t))} · ${esc(posT[x.pos] || x.pos)}</td><td><b>${fmt1(x.price)}</b></td><td>${fmt1(x.pp)}</td></tr>`),
    [t('Παίκτης', 'Player'), t('Ομάδα · θέση', 'Team · position'), 'Credits', t('Εκτίμηση PIR', 'Projected PIR')]) : '';
  const valT = value.length ? tbl(value.map(x => `<tr><td class="l">${pl(x)}</td><td class="l">${esc(team(x.t))} · ${esc(posT[x.pos] || x.pos)}</td><td>${fmt1(x.price)}</td><td>${fmt1(x.pp)}</td><td><b>${x.v.toFixed(2)}</b></td></tr>`),
    [t('Παίκτης', 'Player'), t('Ομάδα · θέση', 'Team · position'), 'Credits', t('Εκτίμηση PIR', 'Projected PIR'), t('PIR ανά credit', 'PIR per credit')]) : '';
  const rd = r => (E ? `Round ${r}` : `${r}η αγωνιστική`);
  const unl = R.unlimitedTradesAfterRounds.map(r => rd(r + 1)).join(', ');

  const title = t(`EuroLeague Fantasy ${season}: πλήρης οδηγός, κανόνες, πόντοι, τιμές και στρατηγική`, `EuroLeague Fantasy ${season} guide: rules, scoring, prices and strategy`);
  const desc = t(`Όλα για το EuroLeague Fantasy Challenge ${season}: 10 παίκτες και προπονητής με ${R.budget} credits, πώς βγαίνουν οι πόντοι (PIR, αρχηγός ×2, +10% στη νίκη), μεταγραφές, πότε αλλάζουν οι τιμές και πώς να διαλέγεις αρχηγό.`,
    `Everything about the EuroLeague Fantasy Challenge ${season}: 10 players and a coach for ${R.budget} credits, how scoring works (PIR, captain ×2, +10% for a win), trades, how prices change and how to pick a captain.`);
  const h1 = t(`EuroLeague Fantasy ${season}: ο πλήρης οδηγός`, `EuroLeague Fantasy ${season}: the complete guide`);

  const faq = [
    [t('Πόσους παίκτες έχει μια ομάδα στο EuroLeague Fantasy;', 'How many players are in a EuroLeague Fantasy team?'),
      t(`${R.players} παίκτες (${R.roster.Guard} γκαρντ, ${R.roster.Forward} φόργουορντ, ${R.roster.Center} σέντερ) και ένας προπονητής, με ${R.budget} credits. Έως ${R.maxPerClub} παίκτες από την ίδια ομάδα.`,
        `${R.players} players (${R.roster.Guard} guards, ${R.roster.Forward} forwards, ${R.roster.Center} centers) plus one head coach, for ${R.budget} credits. Up to ${R.maxPerClub} players from the same club.`)],
    [t('Πώς βγαίνουν οι πόντοι στο EuroLeague Fantasy;', 'How are points scored in EuroLeague Fantasy?'),
      t('Από το PIR του παίκτη στον αγώνα. Αν κερδίσει η ομάδα του παίρνει 10% επιπλέον. Η πεντάδα και ο 6ος παίκτης μετράνε 100%, οι υπόλοιποι 4 του πάγκου 50%, και ο αρχηγός διπλάσια.',
        'From the player’s PIR in the game. If his team wins he gets 10% more. The starting five and the sixth man count 100%, the other four bench players 50%, and the captain counts double.')],
    [t('Πόσο μετράει ο αρχηγός;', 'How much does the captain score?'),
      t('Διπλάσιους πόντους. Αρχηγός μπορεί να είναι μόνο παίκτης της πεντάδας, και μπορείς να τον αλλάξεις ανάμεσα στα turns της αγωνιστικής, όσο δεν έχει παίξει.',
        'Double points. Only a player in your starting five can be captain, and you can change him between the turns of a round as long as he has not played yet.')],
    [t('Πώς βγαίνουν οι πόντοι του προπονητή;', 'How does the coach score?'),
      t(`Από την τελική διαφορά: νίκη με 1–10 ή στην παράταση +${cs[0][2]}, με 11–20 +${cs[1][2]}, με 21+ +${cs[2][2]}. Ήττα με 1–10 ή στην παράταση −5, με 11–20 −10, με 21+ −20.`,
        `From the final margin: a win by 1–10 or in overtime +${cs[0][2]}, by 11–20 +${cs[1][2]}, by 21+ +${cs[2][2]}. A loss by 1–10 or in overtime −5, by 11–20 −10, by 21+ −20.`)],
    [t('Πόσες μεταγραφές έχω κάθε αγωνιστική;', 'How many trades do I get each round?'),
      t(`${R.tradesPerRound} πριν από κάθε αγωνιστική (ο προπονητής μετράει σε αυτές). Πρέπει να γίνουν πριν από το πρώτο τζάμπολ της αγωνιστικής.`,
        `${R.tradesPerRound} before each round (the coach counts as one of them). They must be made before the first tip-off of the round.`)],
    [t('Πότε έχει απεριόριστες αλλαγές;', 'When are trades unlimited?'),
      t(`Πριν από: ${unl}, καθώς και πριν από το play-in, τα playoffs και το Final Four.${nu ? ` Το επόμενο παράθυρο είναι πριν από την ${nu.before}η αγωνιστική (${dTxt(nu.from)}–${dTxt(nu.to)}).` : ''}`,
        `Before ${unl}, and before the play-in, the playoffs and the Final Four.${nu ? ` The next window is before Round ${nu.before} (${dTxt(nu.from)}–${dTxt(nu.to)}).` : ''}`)],
    [t('Πώς αλλάζουν οι τιμές των παικτών;', 'How do player prices change?'),
      t(`Μετά από κάθε αγωνιστική. Από τις επίσημες τιμές της σεζόν βγαίνει ότι η αλλαγή είναι περίπου ${String(priceModel?.slope ?? 0.036).replace('.', ',')} × (fantasy πόντοι − τιμή): παίκτης των ${ex.price} credits που φέρνει ${ex.pts} πόντους ανεβαίνει περίπου ${String(ex.d).replace('.', ',')}. Όποιος δεν παίζει χάνει περίπου ${dnp}% και η τιμή δεν πέφτει κάτω από ${floor}.`,
        `After every round. From this season’s official prices, the change is about ${priceModel?.slope ?? 0.036} × (fantasy points − price): a ${ex.price}-credit player who scores ${ex.pts} points goes up by about ${ex.d}. A player who does not play loses about ${dnp}% and prices do not drop below ${floor}.`)],
    [t('Μπορώ να μπω στο παιχνίδι στη μέση της σεζόν;', 'Can I join in the middle of the season?'),
      t(`Ναι. Οι ομάδες που φτιάχνονται αργότερα παίρνουν ${String(R.lateJoinPerRound).replace('.', ',')} credits επιπλέον για κάθε αγωνιστική που έχει παιχτεί, για να αντισταθμίσουν τις αυξήσεις τιμών.`,
        `Yes. Teams created later get ${R.lateJoinPerRound} extra credits for every round already played, to make up for price rises.`)],
  ];

  const L = { fantasy: url('fantasy'), proj: url('fx:projections'), opt: url('fx:optimizer'), cap: round ? url('fxcap:' + round) : url('fantasy'), price: round ? url('fxprice:' + round) : url('fantasy'),
    coach: round ? url('fxcoach:' + round) : url('fantasy'), pick: round ? url('fpick:' + round) : url('fxrounds'), vb: url('fx:value-board'), cal: url('fxcal'), inj: url('inj'), cmp: url('fxcmp'), rounds: url('fxrounds') };

  const main = `<article class="article lead wide anpage fxguide"><p class="crumbs"><a href="${L.fantasy}">EuroLeague Fantasy</a></p>
<h1>${esc(h1)}</h1>
<p class="lede2">${esc(t(`Το EuroLeague Fantasy Challenge είναι το επίσημο δωρεάν παιχνίδι Fantasy της EuroLeague. Φτιάχνεις ομάδα με ${R.players} παίκτες και έναν προπονητή, και κάθε αγωνιστική παίρνεις πόντους από το PIR τους στους πραγματικούς αγώνες. Εδώ είναι όλοι οι κανόνες της σεζόν ${season} σε μία σελίδα, και τι σημαίνουν στην πράξη.`,
  `The EuroLeague Fantasy Challenge is the EuroLeague’s official free Fantasy game. You build a team of ${R.players} players and a head coach, and every round you score points from their PIR in the real games. Here are all the ${season} rules on one page, and what they mean in practice.`))}</p>
<p class="sub">${esc(t(`Τελευταία ενημέρωση: ${new Date(today + 'T12:00:00Z').toLocaleDateString(loc, { day: 'numeric', month: 'long', year: 'numeric' })}. Οι κανόνες ελέγχθηκαν στο επίσημο rulebook στις ${new Date(R.verified + 'T12:00:00Z').toLocaleDateString(loc, { day: 'numeric', month: 'long', year: 'numeric' })}.`,
  `Last updated: ${new Date(today + 'T12:00:00Z').toLocaleDateString(loc, { day: 'numeric', month: 'long', year: 'numeric' })}. Rules checked against the official rulebook on ${new Date(R.verified + 'T12:00:00Z').toLocaleDateString(loc, { day: 'numeric', month: 'long', year: 'numeric' })}.`))}</p>
<nav class="toc"><b>${t('Περιεχόμενα', 'Contents')}</b><ol>
<li><a href="#squad">${t('Η ομάδα: παίκτες, θέσεις, credits', 'Your squad: players, positions, credits')}</a></li>
<li><a href="#scoring">${t('Πώς βγαίνουν οι πόντοι', 'How scoring works')}</a></li>
<li><a href="#round">${t('Μέσα στην αγωνιστική: πεντάδα, turns, αρχηγός', 'During a round: lineup, turns, captain')}</a></li>
<li><a href="#trades">${t('Μεταγραφές και απεριόριστες αλλαγές', 'Trades and unlimited trades')}</a></li>
<li><a href="#prices">${t('Πώς αλλάζουν οι τιμές', 'How prices change')}</a></li>
<li><a href="#strategy">${t('Στρατηγική: 7 κανόνες που κερδίζουν πόντους', 'Strategy: 7 rules that win points')}</a></li>
<li><a href="#faq">${t('Συχνές ερωτήσεις', 'FAQ')}</a></li></ol></nav>

<h2 id="squad">${t('Η ομάδα: παίκτες, θέσεις, credits', 'Your squad: players, positions, credits')}</h2>
<ul>
<li>${t(`<b>${R.players} παίκτες και 1 προπονητής</b>: ${R.roster.Guard} γκαρντ, ${R.roster.Forward} φόργουορντ, ${R.roster.Center} σέντερ.`, `<b>${R.players} players and 1 head coach</b>: ${R.roster.Guard} guards, ${R.roster.Forward} forwards, ${R.roster.Center} centers.`)}</li>
<li>${t(`<b>${R.budget} credits</b> για όλη την ομάδα. Οι πιο ακριβοί παίκτες κοστίζουν γύρω στα ${top[0] ? fmt1(top[0].price).replace('.', ',') : '20'}, οι φθηνότεροι ${floor}.`, `<b>${R.budget} credits</b> for the whole team. The most expensive players cost around ${top[0] ? fmt1(top[0].price) : '20'}, the cheapest ${floor}.`)}</li>
<li>${t(`Έως <b>${R.maxPerClub} παίκτες από την ίδια ομάδα</b> (και στα playoffs).`, `Up to <b>${R.maxPerClub} players from the same club</b> (playoffs included).`)}</li>
<li>${t('Έως <b>3 ομάδες</b> ανά λογαριασμό, ιδιωτικές λίγκες με φίλους και η γενική κατάταξη με όλους τους παίκτες.', 'Up to <b>3 teams</b> per account, private leagues with friends, and the overall standings against everyone.')}</li>
<li>${t(`Αν μπεις αργότερα, παίρνεις <b>+${String(R.lateJoinPerRound).replace('.', ',')} credits</b> για κάθε αγωνιστική που έχει ήδη παιχτεί.`, `If you join late, you get <b>+${R.lateJoinPerRound} credits</b> for every round already played.`)}</li>
</ul>
${topT ? `<h3>${t(`Οι πιο ακριβοί παίκτες τώρα (${rd(round)})`, `The most expensive players right now (${rd(round)})`)}</h3>${topT}` : ''}

<h2 id="scoring">${t('Πώς βγαίνουν οι πόντοι', 'How scoring works')}</h2>
<p>${esc(t('Οι πόντοι κάθε παίκτη είναι το PIR του (Performance Index Rating), ο επίσημος δείκτης αξιολόγησης της EuroLeague, σε κανονικό χρόνο και παρατάσεις:', 'Each player scores his PIR (Performance Index Rating), the EuroLeague’s official efficiency rating, including overtime:'))}</p>
<p class="pirf"><b>PIR</b> = ${t('πόντοι + ριμπάουντ + ασίστ + κλεψίματα + κοψίματα + φάουλ που δέχτηκε − άστοχα σουτ − άστοχες βολές − λάθη − κοψίματα που δέχτηκε − φάουλ που έκανε', 'points + rebounds + assists + steals + blocks + fouls drawn − missed shots − missed free throws − turnovers − shots blocked − fouls committed')}</p>
<ul>
<li>${t(`<b>Νίκη = +${Math.round(R.winBonus * 100)}%</b>: αν κερδίσει η ομάδα του, ο παίκτης παίρνει το PIR του επί 1,1.`, `<b>Win = +${Math.round(R.winBonus * 100)}%</b>: if his team wins, the player gets his PIR × 1.1.`)}</li>
<li>${t('<b>Πεντάδα και 6ος παίκτης: 100%</b>. <b>Οι άλλοι 4 του πάγκου: 50%</b>.', '<b>Starting five and sixth man: 100%</b>. <b>The other 4 on the bench: 50%</b>.')}</li>
<li>${t(`<b>Αρχηγός: ×${R.captain.multiplier}</b>, μόνο από την πεντάδα.`, `<b>Captain: ×${R.captain.multiplier}</b>, from the starting five only.`)}</li>
</ul>
<p>${esc(t('Παράδειγμα: ο αρχηγός σου γράφει 20 PIR και η ομάδα του κερδίζει. Παίρνεις 20 × 1,1 × 2 = 44 πόντους. Ένας παίκτης του πάγκου με 12 PIR σε ήττα φέρνει 12 × 0,5 = 6.', 'Example: your captain posts 20 PIR and his team wins. You get 20 × 1.1 × 2 = 44 points. A bench player with 12 PIR in a loss brings 12 × 0.5 = 6.'))}</p>
<p>${esc(t('Γι’ αυτό το Fantasy ανταμείβει τους «γεμάτους» παίκτες: ψηλούς που παίρνουν ριμπάουντ και κερδίζουν φάουλ, γκαρντ που μοιράζουν, και όσους σουτάρουν με καλά ποσοστά. Ένας σκόρερ με πολλά άστοχα μπορεί να έχει χαμηλό PIR.', 'That is why Fantasy rewards all-round players: bigs who rebound and draw fouls, guards who create, and efficient shooters. A volume scorer who misses a lot can post a low PIR.'))}</p>
<h3>${t('Ο προπονητής', 'The head coach')}</h3>
${tbl([[t('Νίκη', 'Win'), `+${cs[0][2]}`, `+${cs[1][2]}`, `+${cs[2][2]}`], [t('Ήττα', 'Loss'), '−5', '−10', '−20']].map(r => `<tr><td class="l"><b>${esc(r[0])}</b></td><td class="l">${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td></tr>`),
  [t('Αποτέλεσμα', 'Result'), t('1–10 ή παράταση', '1–10 or OT'), '11–20', '21+'])}
<p>${t(`Ο προπονητής δεν εξαρτάται από το PIR, μόνο από το αποτέλεσμα. Διάλεξε προπονητή ομάδας που είναι καθαρό φαβορί: στη <a href="${L.coach}">σελίδα του προπονητή</a> βλέπεις την πιθανότητα νίκης και τους εκτιμώμενους πόντους κάθε προπονητή.`,
  `The coach does not depend on PIR, only on the result. Pick the coach of a clear favourite: the <a href="${L.coach}">coach page</a> shows each coach’s win probability and projected points.`)}</p>

<h2 id="round">${t('Μέσα στην αγωνιστική: πεντάδα, turns, αρχηγός', 'During a round: lineup, turns, captain')}</h2>
<p>${t(`Η πεντάδα έχει πάντα γκαρντ, φόργουορντ και σέντερ σε έναν από τους σχηματισμούς <b>${Object.keys(FORMATIONS).join(', ')}</b> (γκαρντ-φόργουορντ-σέντερ).`, `Your starting five always has guards, forwards and centers in one of the formations <b>${Object.keys(FORMATIONS).join(', ')}</b> (guards-forwards-centers).`)}</p>
<p>${esc(t('Μια αγωνιστική παίζεται συνήθως σε δύο ή τρεις μέρες (turns). Ανάμεσα στα turns μπορείς να αλλάξεις πεντάδα και πάγκο, σχηματισμό και αρχηγό, αλλά μόνο με παίκτες που δεν έχουν παίξει ακόμα. Αυτό είναι το μεγαλύτερο όπλο του παιχνιδιού: αν ο αρχηγός της Πέμπτης έγραψε λίγο, μπορείς να δώσεις το περιβραχιόνιο σε παίκτη της Παρασκευής.', 'A round is usually played over two or three days (turns). Between turns you can swap starters and bench, change formation and captain, but only with players who have not played yet. This is the game’s biggest weapon: if your Thursday captain had a quiet night, you can hand the armband to a Friday player.'))}</p>
<p>${t(`Γι’ αυτό σε βοηθάει να έχεις παίκτες <b>σε όλες τις μέρες</b> της αγωνιστικής. Ο <a href="${L.cap}">Captain Advisor της αγωνιστικής</a> δείχνει τον καλύτερο αρχηγό για κάθε μέρα.`, `That is why it helps to have players <b>on every day</b> of the round. The <a href="${L.cap}">captain page for this round</a> shows the best captain for each day.`)}</p>

<h2 id="trades">${t('Μεταγραφές και απεριόριστες αλλαγές', 'Trades and unlimited trades')}</h2>
<ul>
<li>${t(`<b>${R.tradesPerRound} μεταγραφές πριν από κάθε αγωνιστική</b>. Ο προπονητής μετράει σε αυτές: ή 4 παίκτες, ή 3 παίκτες και προπονητής.`, `<b>${R.tradesPerRound} trades before every round</b>. The coach counts: either 4 players, or 3 players and the coach.`)}</li>
<li>${t('<b>Προθεσμία</b>: πριν από το πρώτο τζάμπολ της αγωνιστικής.', '<b>Deadline</b>: before the first tip-off of the round.')}</li>
<li>${t('Πουλάς κάθε παίκτη στην <b>τρέχουσα</b> τιμή του, όχι σε αυτήν που τον αγόρασες.', 'You sell every player at his <b>current</b> price, not the price you paid.')}</li>
<li>${t(`<b>Απεριόριστες αλλαγές</b> πριν από: ${unl}, και πριν από play-in, playoffs και Final Four.`, `<b>Unlimited trades</b> before: ${unl}, and before the play-in, playoffs and Final Four.`)}</li>
</ul>
${nu ? `<p class="callout">${esc(t(nu.open ? `Τώρα είναι ανοιχτό παράθυρο απεριόριστων αλλαγών: πριν από την ${nu.before}η αγωνιστική, έως ${dTxt(nu.to)}.` : `Επόμενες απεριόριστες αλλαγές: πριν από την ${nu.before}η αγωνιστική (${dTxt(nu.from)}–${dTxt(nu.to)}).`,
  nu.open ? `Unlimited trades are open now: before Round ${nu.before}, until ${dTxt(nu.to)}.` : `Next unlimited trades: before Round ${nu.before} (${dTxt(nu.from)}–${dTxt(nu.to)}).`))} <a href="${L.cal}">${t('Ημερολόγιο Fantasy →', 'Fantasy calendar →')}</a></p>` : ''}
<p>${esc(t('Στα παράθυρα απεριόριστων αλλαγών σκέψου πέρα από την επόμενη αγωνιστική: μέχρι το επόμενο παράθυρο θα έχεις μόνο 4 αλλαγές τη φορά, άρα χρειάζεσαι παίκτες με καλό πρόγραμμα για 5 αγωνιστικές και όχι για μία.', 'In unlimited windows, think beyond the next round: until the next window you only get 4 trades at a time, so you need players with a good schedule for 5 rounds, not one.'))}</p>

<h2 id="prices">${t('Πώς αλλάζουν οι τιμές', 'How prices change')}</h2>
<p>${esc(t(`Οι τιμές αλλάζουν μετά από κάθε αγωνιστική, ανάλογα με το πόσους πόντους έφερε ο παίκτης σε σχέση με την τιμή του. Η EuroLeague δεν δημοσιεύει τον τύπο. Από ${priceModel?.n ? priceModel.n.toLocaleString(loc) : 'χιλιάδες'} επίσημες αλλαγές τιμών των αγωνιστικών ${priceModel?.round_fit || '1–10'} της σεζόν βγάλαμε ότι ισχύει με πολύ μικρό λάθος:`,
  `Prices change after every round, depending on how many points the player scored compared with his price. The EuroLeague does not publish the formula. From ${priceModel?.n ? priceModel.n.toLocaleString(loc) : 'thousands of'} official price changes in Rounds ${priceModel?.round_fit || '1–10'} this season, we found this holds with a very small error:`))}</p>
<p class="pirf"><b>${t('Αλλαγή τιμής', 'Price change')}</b> ≈ ${String(priceModel?.slope ?? 0.036).replace('.', E ? '.' : ',')} × (${t('fantasy πόντοι', 'fantasy points')} − ${t('τιμή', 'price')})</p>
<ul>
<li>${esc(t(`Παίκτης των ${ex.price} credits που φέρνει ${ex.pts} πόντους: περίπου +${String(ex.d).replace('.', ',')}.`, `A ${ex.price}-credit player who scores ${ex.pts} points: about +${ex.d}.`))}</li>
<li>${esc(t(`Όποιος δεν παίζει χάνει περίπου ${dnp}% της τιμής του. Καμία τιμή δεν πέφτει κάτω από ${floor}.`, `A player who does not play loses about ${dnp}% of his price. No price drops below ${floor}.`))}</li>
<li>${esc(t('Οι πόντοι εδώ είναι οι fantasy πόντοι του αγώνα (PIR, +10% σε νίκη), χωρίς αρχηγό και πάγκο.', 'Points here are the player’s fantasy points for the game (PIR, +10% for a win), without captain or bench multipliers.'))}</li>
</ul>
<p>${t(`Πρακτικά: όποιος παίζει πάνω από την τιμή του ακριβαίνει, και αν τον πάρεις νωρίς κερδίζεις credits για αργότερα. Στη <a href="${L.price}">σελίδα τιμών της αγωνιστικής</a> βλέπεις ποιοι αναμένεται να ακριβύνουν ή να πέσουν.`, `In practice: whoever plays above his price gets more expensive, so buying early earns you credits for later. The <a href="${L.price}">price page for this round</a> shows who is expected to rise or fall.`)}</p>

<h2 id="strategy">${t('Στρατηγική: 7 κανόνες που κερδίζουν πόντους', 'Strategy: 7 rules that win points')}</h2>
<ol>
<li>${t(`<b>Ο αρχηγός κρίνει την αγωνιστική.</b> Μετράει διπλά, άρα ένας σταθερός παίκτης με 25 PIR αξίζει περισσότερο από δύο μέτριους. Δες τον <a href="${L.cap}">καλύτερο αρχηγό ανά μέρα</a>.`, `<b>The captain decides the round.</b> He counts double, so a reliable 25-PIR player is worth more than two average ones. See the <a href="${L.cap}">best captain for each day</a>.`)}</li>
<li>${t(`<b>Μετράνε τα λεπτά, όχι το όνομα.</b> Το PIR έρχεται από τον χρόνο συμμετοχής. Πριν από κάθε αγωνιστική δες τις <a href="${L.inj}">απουσίες</a>: όταν λείπει βασικός, ο αναπληρωματικός του γίνεται ευκαιρία.`, `<b>Minutes matter more than names.</b> PIR comes from playing time. Before every round check the <a href="${L.inj}">injury report</a>: when a starter is out, his backup becomes a bargain.`)}</li>
<li>${t(`<b>Ψάξε αξία, όχι μόνο σταρ.</b> Με ${R.budget} credits για 11 θέσεις δεν χωράνε όλοι οι ακριβοί. Ο <a href="${L.vb}">Value Board</a> δείχνει το PIR ανά credit σε κάθε θέση.`, `<b>Look for value, not just stars.</b> With ${R.budget} credits for 11 spots you cannot afford every star. The <a href="${L.vb}">Value Board</a> shows PIR per credit at each position.`)}</li>
<li>${t(`<b>Σχεδίασε με βάση το πρόγραμμα.</b> Στο <a href="${L.cal}">ημερολόγιο Fantasy</a> βλέπεις τις διπλές εβδομάδες και ποιες ομάδες έχουν τους πιο εύκολους αγώνες μπροστά τους.`, `<b>Plan around the schedule.</b> The <a href="${L.cal}">Fantasy calendar</a> shows double weeks and which teams have the easiest run of games.`)}</li>
<li>${t('<b>Κάλυψε όλες τις μέρες.</b> Με παίκτες σε κάθε turn έχεις πάντα επιλογή για αλλαγή αρχηγού ή για κάποιον που κάθισε στον πάγκο.', '<b>Cover every day.</b> With players in every turn you always have a fallback for your captain or for a player who sat out.')}</li>
<li>${t('<b>Μην καις αλλαγές για μία κακή βραδιά.</b> Οι 4 μεταγραφές ανά αγωνιστική είναι λίγες. Άλλαξε παίκτη όταν αλλάζει ο ρόλος του, όχι όταν είχε ένα κακό ματς.', '<b>Do not burn trades on one bad night.</b> Four trades per round is not many. Change a player when his role changes, not after one poor game.')}</li>
<li>${t(`<b>Σύγκρινε πριν αγοράσεις.</b> Με τη <a href="${L.cmp}">σύγκριση παικτών</a> βάζεις δίπλα-δίπλα τιμή, εκτίμηση PIR για 1, 3 και 5 αγωνιστικές και πρόγραμμα.`, `<b>Compare before you buy.</b> The <a href="${L.cmp}">player comparison</a> puts price, projected PIR over 1, 3 and 5 rounds and the schedule side by side.`)}</li>
</ol>
${valT ? `<h3>${t(`Οι καλύτερες αγορές αξίας για την ${round}η αγωνιστική`, `Best value picks for Round ${round}`)}</h3><p class="sub">${esc(t('Εκτιμώμενο PIR ανά credit, για παίκτες με εκτίμηση τουλάχιστον 8 PIR και χωρίς τραυματισμό.', 'Projected PIR per credit, for players projected at 8+ PIR and not injured.'))}</p>${valT}` : ''}
<p>${t(`Για την τρέχουσα αγωνιστική: <a href="${L.pick}">προτάσεις και ανάλυση</a> · <a href="${L.proj}">εκτιμήσεις PIR για όλους</a> · <a href="${L.opt}">η καλύτερη ομάδα για ${R.budget} credits</a> · <a href="${L.rounds}">όλες οι αγωνιστικές</a>.`,
  `For the current round: <a href="${L.pick}">tips and analysis</a> · <a href="${L.proj}">PIR projections for every player</a> · <a href="${L.opt}">the best team for ${R.budget} credits</a> · <a href="${L.rounds}">all rounds</a>.`)}</p>

<section class="faq" id="faq"><h2>${t('Συχνές ερωτήσεις', 'Frequently asked questions')}</h2>${faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</section>
<p class="note">${t(`Πηγή κανόνων: <a href="${R.source}" rel="nofollow">επίσημο rulebook του EuroLeague Fantasy Challenge</a>. Οι κανόνες μπορεί να αλλάξουν μέσα στη σεζόν· η επίσημη εφαρμογή έχει πάντα τον τελευταίο λόγο.`, `Rules source: <a href="${R.source}" rel="nofollow">official EuroLeague Fantasy Challenge rulebook</a>. Rules can change during the season; the official app always has the final word.`)}</p>
</article>`;
  return { title, desc, h1, main, faq };
}
