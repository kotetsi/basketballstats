# The 30 formats

Generated from the specs in `src/formats/` (`node video-formats/scripts/docs.mjs`). Availability as of data through round 13.

## Statistical intelligence

### 1. The Numbers Don't Lie `numbers-dont-lie`

**Status:** available

One striking statistical fact, shown with the leaderboard that proves it.

| | |
|---|---|
| Concept | Find the season average that stands furthest above the league (largest z-score among qualified players) and let the board make the point. |
| Audience | EuroLeague fans and Fantasy players who like hard numbers |
| Duration | short (supports short, medium, long) |
| Aspect ratios | 9x16, 16x9, 1x1 |
| Required data | `boxscores` (season averages) |
| Validation | player must meet the minimum games threshold (half the rounds played); leader must be at least 2 standard deviations above the qualified mean |
| Script structure | hook: the fact → evidence: top 5 board → conclusion: the gap to number two → question |
| Visual template | kit: statement → board |
| Narration | energetic: Confident and punchy. Lead with the number. |
| Frequency | 2 per week |
| Example | "Sasha Vezenkov averages 23.9 PIR. Nobody else in the EuroLeague is above 21.3." |

### 2. Statistical Twin `statistical-twin`

**Status:** available

Two players on different teams whose statistical profiles are almost identical.

| | |
|---|---|
| Concept | Cosine similarity of z-scored per-game profiles (points, rebounds, assists, steals, blocks, 3-point rate, true shooting, minutes). |
| Audience | Fans who enjoy surprising comparisons; Fantasy players looking for cheaper equivalents |
| Duration | medium (supports short, medium, long) |
| Aspect ratios | 9x16, 16x9, 1x1 |
| Required data | `boxscores` (season averages) |
| Validation | both players qualified (minimum games); different teams; similarity ≥ 0.90 (cosine); both play 20+ minutes and score 7+ points per game |
| Script structure | hook: two names → evidence: side-by-side rows → sequence: profile radar → conclusion: similarity score + price if available → question |
| Visual template | kit: compare → radar → statement |
| Narration | analyst: Curious, a little playful: "same player, different jersey". |
| Frequency | weekly |
| Example | "Same numbers, different jerseys: two forwards with a 97% profile match." |

### 3. The Stat Paradox `stat-paradox`

**Status:** available

A team whose record and point differential tell different stories.

| | |
|---|---|
| Concept | Compare actual wins with Pythagorean expected wins (points for/against, exponent 14). The biggest gap is the paradox. |
| Audience | Analytics-minded fans |
| Duration | short (supports short, medium, long) |
| Aspect ratios | 9x16, 16x9, 1x1 |
| Required data | `standings` (wins, losses, points for/against); `results` (games played) |
| Validation | at least 6 games per team; gap between actual and expected wins ≥ 1.5 |
| Script structure | hook: the contradiction → evidence: record vs differential → conclusion: luck or clutch? → question |
| Visual template | kit: statement → compare |
| Narration | analyst: Puzzle tone, then resolve it with the numbers. |
| Frequency | every 2 weeks |
| Example | "9-4 with a points differential that predicts 7-6." |

### 4. The Statistical Court `statistical-court`

**Status:** planned. data is available; the format builder is not implemented yet

A player is "on trial": the case for and against, judged on percentiles.

| | |
|---|---|
| Concept | Prosecution = weakest percentiles, defence = strongest; verdict from the composite. |
| Audience | Fans debating overrated/underrated players |
| Duration | medium (supports short, medium, long) |
| Aspect ratios | 9x16, 16x9, 1x1 |
| Required data | `boxscores` (season averages) |
| Validation | player qualified; at least 3 strengths and 2 weaknesses with ≥ 25 percentile gap |
| Script structure | hook: the charge → narrative: prosecution → evidence: defence → conclusion: verdict → question |
| Visual template | kit: statement → split → radar |
| Narration | analyst: Courtroom framing, light-hearted. |
| Frequency | every 2 weeks |
| Example | "The charge: overrated. The evidence: 12th percentile in efficiency…" |

### 5. The Clutch Report `clutch-report`

**Status:** available

Who delivers when the game is on the line: shooting in clutch time.

| | |
|---|---|
| Concept | Shots flagged as clutch in the play-by-play shot data (last minutes, close score): attempts and FG% vs the same players outside clutch time. |
| Audience | Fans of big moments; Fantasy players choosing captains |
| Duration | medium (supports short, medium, long) |
| Aspect ratios | 9x16, 16x9, 1x1 |
| Required data | `shots` (clutch-flagged shots); `boxscores` (season averages) |
| Validation | minimum 12 clutch attempts per player; shot data must cover at least 60 games |
| Script structure | hook → evidence: clutch FG% board → narrative: compare with their normal FG% → conclusion → question |
| Visual template | kit: board → compare |
| Narration | hype: Tension, then release on the number. |
| Frequency | weekly |
| Example | "In clutch time he shoots 58%, eleven points better than the rest of his game." |

### 6. The Efficiency Trap `efficiency-trap`

**Status:** available

High-volume scorers whose shooting efficiency lags the league.

| | |
|---|---|
| Concept | Players with 10+ field-goal attempts a game ranked by true shooting %, against the qualified average. |
| Audience | Fans who look beyond points per game; Fantasy players (PIR punishes misses) |
| Duration | medium (supports short, medium, long) |
| Aspect ratios | 9x16, 16x9, 1x1 |
| Required data | `boxscores` (season averages) |
| Validation | 10+ FGA per game; TS% at least 3 points below the qualified average |
| Script structure | hook: points are not everything → evidence: lowest TS% among volume shooters → conclusion: what it costs in PIR → question |
| Visual template | kit: statement → board |
| Narration | analyst: Fair, not mocking; frame as a trade-off. |
| Frequency | every 2 weeks |
| Example | "He takes 14 shots a game, at 48% true shooting." |

### 7. The Shot Diet `shot-diet`

**Status:** available

Where a player takes his shots, zone by zone, against the league.

| | |
|---|---|
| Concept | Shot-location data aggregated into 8 zones; the player whose diet differs most from the league average. |
| Audience | Tactics fans and coaches |
| Duration | medium (supports short, medium, long) |
| Aspect ratios | 9x16, 1x1, 16x9 |
| Required data | `shots` (shot locations by zone); `boxscores` (season averages) |
| Validation | at least 100 shots for the player; zones from official coordinates |
| Script structure | hook → sequence: court map → evidence: zone shares vs league → conclusion → question |
| Visual template | kit: court → split |
| Narration | analyst: Explain like a coach at a whiteboard. |
| Frequency | weekly |
| Example | "62% of his shots come at the rim. The league average is 31%." |

### 8. Prediction vs Reality `prediction-vs-reality`

**Status:** available

How the basketballstats.eu match model's pre-game probabilities compared with what happened.

| | |
|---|---|
| Concept | Logged win probabilities (before tip-off) against results: accuracy, favourites, and the biggest upset. |
| Audience | Fans and bettors interested in model transparency |
| Duration | short (supports short, medium, long) |
| Aspect ratios | 9x16, 16x9, 1x1 |
| Required data | `matchPredictions` (logged pre-game probabilities); `results` (actual results) |
| Validation | only predictions logged before the game; at least 20 settled games |
| Script structure | hook → evidence: accuracy → sequence: favourites → narrative: biggest upset → conclusion → question |
| Visual template | kit: big → split → statement |
| Narration | analyst: Transparent and honest, including misses. |
| Frequency | weekly (after each round) |
| Example | "The model called 41 of 60 games. Its biggest miss: a 78% favourite." |

## Player and team discovery

### 9. The Underrated Player `underrated-player`

**Status:** available

Production per minute that the minutes (and the Fantasy price) do not reflect yet.

| | |
|---|---|
| Concept | Qualified players under 22 minutes a game, ranked by PIR per minute; Fantasy price shown when available. |
| Audience | Fantasy managers hunting value; scouts |
| Duration | short (supports short, medium, long) |
| Aspect ratios | 9x16, 16x9, 1x1 |
| Required data | `boxscores` (season box scores); `fantasyPrices` (price context) |
| Validation | qualified on games; under 22 minutes a game; top PIR per minute |
| Script structure | hook → evidence: PIR per minute vs league → narrative: what more minutes could mean → conclusion: price → question |
| Visual template | kit: big → board |
| Narration | energetic: Scout-like discovery tone. |
| Frequency | weekly |
| Example | "He plays 17 minutes. Per minute, he is a top-10 producer." |

### 10. The Future Stars `future-stars`

**Status:** available

The best young players in the EuroLeague and how they have grown since last season.

| | |
|---|---|
| Concept | Players aged 23 or younger ranked by PIR, with last season’s PIR from the history dataset to show development. |
| Audience | Fans and scouts; long-term Fantasy planning |
| Duration | medium (supports short, medium, long) |
| Aspect ratios | 9x16, 16x9, 1x1 |
| Required data | `boxscores` (season box scores); `bio` (age); `history` (previous-season development) |
| Validation | age ≤ 23 at data date; qualified on games; previous season PIR shown only if 5+ games played |
| Script structure | hook → sequence: top young players → evidence: development since last season → conclusion → question |
| Visual template | kit: board → compare |
| Narration | energetic: Optimistic, forward-looking. |
| Frequency | monthly |
| Example | "21 years old, 15.2 PIR, up 6 from last season." |

### 11. The Player Transformation `player-transformation`

**Status:** available

The biggest year-over-year change in production.

| | |
|---|---|
| Concept | This season’s per-game numbers against last season’s (history dataset, same player id), largest PIR increase. |
| Audience | Fans following player development; Fantasy managers |
| Duration | medium (supports short, medium, long) |
| Aspect ratios | 9x16, 16x9, 1x1 |
| Required data | `boxscores` (season box scores); `history` (last season averages) |
| Validation | 10+ games last season; qualified this season; PIR change ≥ 4 |
| Script structure | hook → evidence: before vs after → narrative: what changed (minutes, scoring) → conclusion → question |
| Visual template | kit: compare → big |
| Narration | energetic: Before/after story. |
| Frequency | every 2 weeks |
| Example | "Last season 8.1 PIR. This season 17.4." |

### 12. The Team DNA `team-dna`

**Status:** available

A team’s statistical identity: what it does more, or less, than everyone else.

| | |
|---|---|
| Concept | Team per-game profile from box scores (points, 3-point rate, assist rate, rebounds, turnovers, steals+blocks, points allowed), as league percentiles. |
| Audience | Fans of a team; tactics fans |
| Duration | medium (supports short, medium, long) |
| Aspect ratios | 9x16, 16x9, 1x1 |
| Required data | `boxscores` (season box scores); `results` (points allowed) |
| Validation | at least 6 games; identity = traits ≥ 80th or ≤ 20th percentile |
| Script structure | hook → sequence: radar → evidence: top traits → conclusion → question |
| Visual template | kit: radar → board |
| Narration | analyst: Describe the identity like a scouting report. |
| Frequency | weekly (rotate teams) |
| Example | "First in assist rate, last in three-point attempts." |

### 13. The Bench Effect `bench-effect`

**Status:** available

How much of each team’s scoring comes from the bench.

| | |
|---|---|
| Concept | Starters from play-by-play; bench share = points by non-starters / team points, over games with play-by-play. |
| Audience | Team fans; tactics fans |
| Duration | short (supports short, medium, long) |
| Aspect ratios | 9x16, 16x9, 1x1 |
| Required data | `boxscores` (season box scores); `starters` (who started each game) |
| Validation | team-games with known starters only; at least 6 such games per team |
| Script structure | hook → evidence: most and least bench-dependent → sequence: split bars → conclusion → question |
| Visual template | kit: split → board |
| Narration | analyst: Rotation talk, depth. |
| Frequency | monthly |
| Example | "44% of their points come off the bench. League low: 22%." |

### 14. The Rotation Lab `rotation-lab`

**Status:** planned. data is available; the format builder is not implemented yet

Which lineups and rotations work, from lineup stints.

| | |
|---|---|
| Concept | Net rating of five-man units and minutes distribution from play-by-play stints. |
| Audience | Tactics fans, coaches |
| Duration | medium (supports short, medium, long) |
| Aspect ratios | 9x16, 16x9, 1x1 |
| Required data | `lineups` (five-man stints with points for/against) |
| Validation | min. 40 minutes per lineup; possession-based net rating |
| Script structure | hook → evidence → sequence → conclusion → question |
| Visual template | kit: board → split |
| Narration | analyst: Coach-like. |
| Frequency | monthly |
| Example | "Their best five: +18 per 100 possessions in 63 minutes." |

### 15. The Matchup Lab `matchup-lab`

**Status:** available

An upcoming game broken down: team profiles side by side and the model’s pre-game probability.

| | |
|---|---|
| Concept | Next-round fixture; team per-game profiles; logged model win probability; current records. |
| Audience | Fans and bettors before the game |
| Duration | short (supports short, medium, long) |
| Aspect ratios | 9x16, 16x9, 1x1 |
| Required data | `schedule` (upcoming fixtures); `matchPredictions` (pre-game win probability); `boxscores` (season box scores); `standings` (records) |
| Validation | game not started; prediction logged for this game |
| Script structure | hook → evidence: key profile gaps → narrative: records → conclusion: model probability → question |
| Visual template | kit: compare → big |
| Narration | energetic: Pre-game hype with numbers. |
| Frequency | game days |
| Example | "Valencia score 94 a game; Panathinaikos allow 81. The model: 58% Valencia." |

## Interactive content

### 16. Guess the Player `guess-the-player`

**Status:** available

Clues revealed one by one, from bio to stat line; the name comes last.

| | |
|---|---|
| Concept | A top-40 player by PIR; clues use position, height, country, age and season averages; team and name are revealed at the end. |
| Audience | All fans; high comment potential |
| Duration | short (supports short, medium, long) |
| Aspect ratios | 9x16, 16x9, 1x1 |
| Required data | `boxscores` (season averages); `bio` (height, country, age, position) |
| Validation | player must be top-40 by PIR (recognisable); bio fields present; clues must not contain the name or team |
| Script structure | hook: the challenge → sequence: 4 clues → evidence: stat line clue → conclusion: reveal → question: did you get it? |
| Visual template | kit: clues (reveal) |
| Narration | energetic: Game-show pacing; pause before the reveal. |
| Frequency | 2 per week |
| Example | "Clue 1: forward, 2.03 m. Clue 2: from Bulgaria…" |

### 17. Basketball IQ Test `basketball-iq-test`

**Status:** available

Three quick data questions: who has more, which is higher. Score yourself.

| | |
|---|---|
| Concept | Pairs of well-known players with close but different season averages; the answer is revealed with both values. |
| Audience | Fans who like quizzes |
| Duration | medium (supports short, medium, long) |
| Aspect ratios | 9x16, 16x9, 1x1 |
| Required data | `boxscores` (season averages) |
| Validation | values must differ (no ties); difference small enough to be a real question (≤ 25%) |
| Script structure | hook → sequence: question 1-3 → evidence: reveals with values → conclusion: score yourself → question |
| Visual template | kit: question ×3 |
| Narration | energetic: Quiz host. |
| Frequency | weekly |
| Example | "Question one: who averages more assists, Nunn or Larkin?" |

### 18. Who Would You Pick? `who-would-you-pick`

**Status:** available

Two Fantasy options at nearly the same price; the numbers, then your vote.

| | |
|---|---|
| Concept | Pairs of qualified players within 1.0 credit of each other, compared on PIR, recent form and next-round projection. |
| Audience | EuroLeague Fantasy managers |
| Duration | short (supports short, medium, long) |
| Aspect ratios | 9x16, 16x9, 1x1 |
| Required data | `boxscores` (season averages); `fantasyPrices` (prices); `projections` (next-round PIR projection) |
| Validation | price gap ≤ 1.0; both have a projection; no answer given: it is a vote |
| Script structure | hook → evidence: price + PIR → narrative: form and projection → conclusion: the trade-off → question: vote |
| Visual template | kit: compare → question |
| Narration | energetic: Neutral; let the audience decide. |
| Frequency | every round |
| Example | "Both cost 15. One projects 18 PIR, the other is hotter right now." |

### 19. Rank These Players `rank-these-players`

**Status:** available

Four players, one stat: rank them, then see the real order.

| | |
|---|---|
| Concept | Four recognisable players with distinct values in one metric; the board reveals the order bottom-up. |
| Audience | All fans |
| Duration | short (supports short, medium, long) |
| Aspect ratios | 9x16, 16x9, 1x1 |
| Required data | `boxscores` (season averages) |
| Validation | four players from four different teams; values strictly different |
| Script structure | hook: the four names → sequence: pause to rank → evidence: reveal 4 to 1 → conclusion → question |
| Visual template | kit: question → board |
| Narration | energetic: Challenge the viewer. |
| Frequency | weekly |
| Example | "Rank them by PIR: Vezenkov, Nunn, Hifi, Shorts." |

### 20. The Data Challenge `data-challenge`

**Status:** available

A statistical club with very few members: can you name them?

| | |
|---|---|
| Concept | Find thresholds on two stats that only 2–4 qualified players meet; reveal the members. |
| Audience | Hardcore fans |
| Duration | short (supports short, medium, long) |
| Aspect ratios | 9x16, 16x9, 1x1 |
| Required data | `boxscores` (season averages) |
| Validation | 2 to 4 members; thresholds are round numbers |
| Script structure | hook: the club → sequence: thinking time → evidence: the members → conclusion → question |
| Visual template | kit: statement → board |
| Narration | energetic: Trivia tone. |
| Frequency | weekly |
| Example | "Only 3 players average 12+ points and 5+ assists. Name them." |

### 21. Agree or Disagree? `agree-or-disagree`

**Status:** missing-data. Missing: no claims input yet: add an editorial claims queue (dashboard) to enable

A popular claim tested against the data; the audience votes, then the verdict.

| | |
|---|---|
| Concept | Editor-supplied claim (e.g. from social media) checked against a computable statistic. |
| Audience | Fans in debates |
| Duration | short (supports short, medium, long) |
| Aspect ratios | 9x16, 16x9, 1x1 |
| Required data | `boxscores` (season averages); `editorialClaims` (approved claims to test (editor input)) |
| Validation | claim must map to a computable statistic; verdict only from data |
| Script structure | hook: the claim → question: vote → evidence → conclusion: verdict → question |
| Visual template | kit: statement → question → compare |
| Narration | analyst: Fair-minded referee. |
| Frequency | weekly |
| Example | "Claim: Real Madrid are better at home. Verdict: true, 6-0 vs 1-6." |

## Historical and storytelling

### 22. Basketball Time Machine `basketball-time-machine`

**Status:** available

Back to a past season: who ruled, who won, and how it compares with now.

| | |
|---|---|
| Concept | A season from the history dataset (5 years back by default): champion, top of the standings, best player by PIR, compared with this season’s leader. |
| Audience | Nostalgic fans; evergreen content for days without games |
| Duration | medium (supports short, medium, long) |
| Aspect ratios | 9x16, 16x9, 1x1 |
| Required data | `history` (past seasons: standings, finals, player averages); `boxscores` (this season for comparison) |
| Validation | season must have standings, final and player rows; player minimum: half the regular-season games |
| Script structure | hook: the year → narrative: standings → evidence: best player → conclusion: then vs now → question |
| Visual template | kit: board → big → compare |
| Narration | analyst: Storyteller, warm. |
| Frequency | weekly (evergreen) |
| Example | "2021-22: Anadolu Efes champions, and the best PIR in the league was…" |

### 23. One Season in 60 Seconds `one-season-in-60-seconds`

**Status:** available

An entire EuroLeague season told in about a minute.

| | |
|---|---|
| Concept | Regular-season top, best player, top scorer, final result, all from the history dataset. |
| Audience | All fans; evergreen |
| Duration | long (supports medium, long) |
| Aspect ratios | 9x16, 16x9, 1x1 |
| Required data | `history` (past seasons: standings, finals, player averages) |
| Validation | complete season (final played); player minimum games |
| Script structure | hook → narrative: the regular season → evidence: best player and top scorer → sequence: the final → conclusion → question |
| Visual template | kit: board → big → statement |
| Narration | energetic: Fast montage pace. |
| Frequency | weekly (evergreen) |
| Example | "2024-25 in 60 seconds: Olympiacos 26-12, Vezenkov 20.9 PIR, and the title went to…" |

### 24. What Happened Next? `what-happened-next`

**Status:** missing-data. Missing: history has EuroLeague-only season rows; careers outside EuroLeague are not in the data

A standout season, then the seasons that followed.

| | |
|---|---|
| Concept | Player trajectories linked across seasons by player id in the history dataset. |
| Audience | Fans who love career stories |
| Duration | medium (supports short, medium, long) |
| Aspect ratios | 9x16, 16x9, 1x1 |
| Required data | `history` (past seasons: standings, finals, player averages); `careerLinks` (player careers linked across seasons and teams (incl. outside EuroLeague)) |
| Validation | at least 3 consecutive seasons for the player |
| Script structure | hook → narrative → evidence → sequence → conclusion → question |
| Visual template | kit: bars → statement |
| Narration | analyst: Story arc. |
| Frequency | monthly |
| Example | "He led the league in assists in 2019-20. Then this happened." |

### 25. The Impossible Record `impossible-record`

**Status:** available

The best single-game performances of the season, and how far ahead the record is.

| | |
|---|---|
| Concept | Single-game highs this season (PIR, points, rebounds, assists) from box scores; the record and its gap to the next best. |
| Audience | All fans |
| Duration | short (supports short, medium, long) |
| Aspect ratios | 9x16, 16x9, 1x1 |
| Required data | `boxscores` (single games) |
| Validation | current season only (historical single-game data not in the dataset); ties shown together |
| Script structure | hook → evidence: the record → sequence: the chasers → conclusion: the gap → question |
| Visual template | kit: big → board |
| Narration | hype: Awe. |
| Frequency | monthly |
| Example | "41 PIR in one game. Nobody else has reached 38." |

## Special editorial formats

### 26. Basketball Stock Market `basketball-stock-market`

**Status:** available

Fantasy prices as a stock market: biggest risers and fallers, with the price chart.

| | |
|---|---|
| Concept | Official EuroLeague Fantasy price history by round; change from the first tracked round to now. |
| Audience | EuroLeague Fantasy managers |
| Duration | short (supports short, medium, long) |
| Aspect ratios | 9x16, 16x9, 1x1 |
| Required data | `priceHistory` (price by round); `boxscores` (names and teams) |
| Validation | at least 4 tracked rounds; price change ≥ 1.5 credits |
| Script structure | hook: market open → evidence: top riser → sequence: price chart → narrative: biggest faller → conclusion → question: buy or sell? |
| Visual template | kit: board → bars |
| Narration | energetic: Market-report parody, serious numbers. |
| Frequency | every round |
| Example | "Up 4.1 credits since round 4: the hottest stock in the EuroLeague." |

### 27. The Perfect Team `perfect-team`

**Status:** missing-data. Missing: budget (100) and per-team limit (6) are known; squad size and position slots are not in the data

The best possible Fantasy team for the round within the budget and roster rules.

| | |
|---|---|
| Concept | Optimise projected PIR under budget, roster-size, position and per-team limits. |
| Audience | EuroLeague Fantasy managers |
| Duration | medium (supports short, medium, long) |
| Aspect ratios | 9x16, 16x9, 1x1 |
| Required data | `projections` (projected PIR); `fantasyPrices` (prices); `fantasyRules` (roster size and position slots) |
| Validation | valid under every game rule; projections quality ok |
| Script structure | hook → evidence → sequence → conclusion → question |
| Visual template | kit: board → big |
| Narration | energetic: Coach announcing the lineup. |
| Frequency | every round |
| Example | "100 credits, the best projected ten: 214 PIR." |

### 28. The Home Court Myth `home-court-myth`

**Status:** available

How much home court is really worth this season, and who depends on it most.

| | |
|---|---|
| Concept | League-wide home win % from results; teams with the biggest home/away gap from standings. |
| Audience | All fans; bettors |
| Duration | short (supports short, medium, long) |
| Aspect ratios | 9x16, 16x9, 1x1 |
| Required data | `standings` (home and away records); `results` (home win rate) |
| Validation | at least 60 games; team gap from at least 5 home and 5 away games |
| Script structure | hook: the myth → evidence: league home win % → narrative: biggest gaps → conclusion → question |
| Visual template | kit: big → split |
| Narration | analyst: Myth-busting. |
| Frequency | monthly |
| Example | "Home teams win 62% of games. Real Madrid: 6-0 at home, 1-6 away." |

### 29. The Basketball Daily Show `basketball-daily-show`

**Status:** available

The latest round in one video: every result and the top performer of each game.

| | |
|---|---|
| Concept | Results of the most recent round from the results dataset plus the best PIR per game from box scores. |
| Audience | All fans, the morning after |
| Duration | long (supports medium, long, editorial) |
| Aspect ratios | 9x16, 16x9, 1x1 |
| Required data | `results` (scores); `boxscores` (top performers) |
| Validation | round must be complete or at least 4 games played; top performer = max PIR in that game |
| Script structure | hook → sequence: each result → evidence: performance of the round → conclusion → question |
| Visual template | kit: board → big |
| Narration | energetic: News anchor. |
| Frequency | day after each game day |
| Example | "Round 13: Milan beat Fenerbahce 88-79, Moses Wright 36 PIR…" |

### 30. The Basketball World Ranking `basketball-world-ranking`

**Status:** missing-data. Missing: only EuroLeague (and partial EuroCup) data exists

A global ranking of clubs or players across competitions.

| | |
|---|---|
| Concept | Cross-competition rating (strength-adjusted) for clubs worldwide. |
| Audience | Global basketball fans |
| Duration | medium (supports short, medium, long) |
| Aspect ratios | 9x16, 16x9, 1x1 |
| Required data | `multiCompetition` (comparable data for leagues worldwide) |
| Validation | competition-strength adjustment; minimum games per club |
| Script structure | hook → evidence → sequence → conclusion → question |
| Visual template | kit: board |
| Narration | analyst: Authoritative. |
| Frequency | monthly |
| Example | "The world’s top 10 clubs this month." |
