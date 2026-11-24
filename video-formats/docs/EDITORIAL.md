# Editorial engine, scoring, calendar, analytics

## Script structure

Every request has, for every duration, a script with the roles **hook → narrative / evidence / sequence → conclusion → question**. The engine refuses a request if:
- a required role (hook, evidence, conclusion, question) is missing
- a segment points at a scene that does not exist
- any number in the script is not in the request's `data` (fact guard)
- the text uses generic AI phrasing ("let's dive", "game-changer", "insane", …)
- the recommended-duration script runs more than 15% over its limit

Wording varies deterministically per story (`pick(seed, variants)`). The same story always gets the same text, different stories get different openings. Facts are never paraphrased into numbers that are not in the data. Nationality, for example, is stated as nationality, not birthplace. The optional Claude rewrite in the Video Factory keeps the format's voice notes and audience question, and passes the same fact guard.

## Opportunity score (0–100)

`scoring.mjs`, weights editable:

| Component | Weight | Meaning |
|---|---|---|
| significance | 0.22 | How unusual the finding is (format-specific: z-score, similarity, gap, …) |
| interest | 0.16 | Star power (PIR percentile of the players involved), big clubs, interactive bonus |
| dataQuality | 0.12 | Sample size / coverage behind the story |
| originality | 0.14 | Lower if the same format ran in the last 7 days or the same players in the last 14 |
| timeliness | 0.14 | Game-day formats near tip-off, recaps after games, evergreen = neutral |
| fantasy | 0.10 | Relevance to EuroLeague Fantasy |
| pastPerformance | 0.12 | The format's engagement vs the median format. Neutral (0.5) until 3+ published videos |

The score is an estimate of editorial potential, **not** a forecast of views. The UI and API say so.

## Editorial calendar

`calendar.mjs` recommends up to 2 formats a day (more can be planned manually):
- **Game day:** Matchup Lab, Who Would You Pick?
- **Morning after:** Basketball Daily Show
- **Day before a round:** Stock Market, Underrated Player (Fantasy deadline)
- **Weekly shows:** Fantasy Monday, Stat Thursday, Throwback Saturday, Sunday Quiz
- **No games:** evergreen and discovery formats
- **Cool-down:** a format is not suggested again within 6 days (recaps/previews exempt). Formats reserved for a weekly show are held for that day
- **Manual entries** (`video-formats/calendar.json`) always appear, marked as manual

It only recommends. Producing a request still needs a click, and publishing is manual.

## Performance analytics

`analytics.mjs` aggregates the metrics entered per video in the Video Factory: views, average watch time, completion, shares, comments, engagement rate ((likes + comments + shares) / views), site visits, registrations. It needs at least **3 published videos** per format before it recommends anything:
- **invest more:** ≥ 1.2× the median format's engagement
- **rethink/reduce:** ≤ 0.7×
- **keep:** in between

The ratio feeds back into the opportunity score and the calendar. Past performance is reported as what happened, not as a guarantee.

## Copyright and visuals

Formats use only the Video Factory scene kit: original data graphics, animated charts, court diagrams and typography. No player photos, broadcast footage, logos or third-party music. Players appear as names and team colours (abstract representation). A future Image Library plugs in through the Video Factory's asset registry (`video-factory/assets/licenses.json`), with source and licence for every asset.
