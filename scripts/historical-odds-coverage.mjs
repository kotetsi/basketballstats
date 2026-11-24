// Audit the round-10 games with archived first predictions. Output coverage only.
const games = [
  {"id":"E-10-MAD-PAN","kickoff":"2026-11-04T19:45:00Z","cutoff":"2026-11-04T13:18:07+00:00"},
  {"id":"E-10-IST-PRS","kickoff":"2026-11-05T17:15:00Z","cutoff":"2026-11-04T13:18:07+00:00"},
  {"id":"E-10-ULK-BAS","kickoff":"2026-11-05T18:00:00Z","cutoff":"2026-11-04T13:18:07+00:00"},
  {"id":"E-10-HTA-BAR","kickoff":"2026-11-05T18:45:00Z","cutoff":"2026-11-04T13:18:07+00:00"},
  {"id":"E-10-ASV-MUN","kickoff":"2026-11-05T19:00:00Z","cutoff":"2026-11-04T13:18:07+00:00"},
  {"id":"E-10-MIL-PAM","kickoff":"2026-11-05T19:30:00Z","cutoff":"2026-11-04T13:18:07+00:00"},
  {"id":"E-10-BES-ZAL","kickoff":"2026-11-06T17:00:00Z","cutoff":"2026-11-04T13:18:07+00:00"},
  {"id":"E-10-OLY-RED","kickoff":"2026-11-06T19:15:00Z","cutoff":"2026-11-04T13:18:07+00:00"},
  {"id":"E-10-VIR-DUB","kickoff":"2026-11-06T19:30:00Z","cutoff":"2026-11-04T13:18:07+00:00"},
  {"id":"E-10-PAR-TEL","kickoff":"2026-11-06T19:45:00Z","cutoff":"2026-11-04T13:18:07+00:00"},
];
const books = ['stoiximan', 'bet365.gr'];
const apiKey = process.env.ODDS_API_KEY;

async function request(endpoint, params) {
  const url = new URL('https://api.oddspapi.io/v4/' + endpoint);
  url.search = new URLSearchParams({ ...params, apiKey });
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
  return { status: response.status, body: response.ok ? await response.json() : null };
}

function hasActivePair(book, cutoff) {
  const outcomes = Object.values(book?.markets?.['111']?.outcomes ?? {});
  return outcomes.length === 2 && outcomes.every(outcome => {
    const entries = outcome.players?.['0'];
    if (!Array.isArray(entries)) return false;
    const latest = entries.filter(entry => Date.parse(entry.createdAt) <= cutoff)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    const first = latest[0];
    // If equally timed entries disagree about the price or active state, coverage is ambiguous.
    return first?.active === true && Number.isFinite(first.price) && first.price > 1 &&
      latest.filter(entry => Date.parse(entry.createdAt) === Date.parse(first.createdAt))
        .every(entry => entry.active === first.active && entry.price === first.price);
  });
}

async function audit() {
  if (!apiKey) throw new Error('Missing API key');
  const fixtures = await request('fixtures', {
    sportId: 11, tournamentId: 138, statusId: 2,
    from: '2026-11-04T00:00:00Z', to: '2026-11-07T00:00:00Z',
  });
  if (fixtures.status !== 200 || !Array.isArray(fixtures.body)) {
    console.log(JSON.stringify({ fixturesStatus: fixtures.status }));
    process.exitCode = 1;
    return;
  }
  const rows = [];
  let previousRequest = false;
  for (const game of games) {
    const matches = fixtures.body.filter(fixture =>
      Date.parse(fixture.startTime) === Date.parse(game.kickoff) &&
      /^id\d+$/.test(fixture.fixtureId)
    );
    if (matches.length !== 1) {
      rows.push({ game: game.id, candidates: matches.length });
      continue;
    }
    const fixture = matches[0];
    if (previousRequest) await new Promise(resolve => setTimeout(resolve, 5500));
    previousRequest = true;
    const result = await request('historical-odds', {
      fixtureId: fixture.fixtureId, bookmakers: books.join(','),
    });
    const valid = result.status === 200 && result.body?.fixtureId === fixture.fixtureId &&
      result.body?.bookmakers && typeof result.body.bookmakers === 'object';
    const label = name => typeof name === 'string' ? name.replace(/[^\p{L}\p{N} .'-]/gu, '').slice(0, 80) : '';
    rows.push({
      game: game.id,
      fixtureId: fixture.fixtureId,
      participants: [label(fixture.participant1Name), label(fixture.participant2Name)],
      status: result.status,
      valid: Boolean(valid),
      coverage: valid ? Object.fromEntries(books.map(book => [
        book, hasActivePair(result.body.bookmakers[book], Date.parse(game.cutoff)),
      ])) : null,
    });
    console.log(JSON.stringify(rows.at(-1)));
  }
  console.log(JSON.stringify({ checked: rows.length, valid: rows.filter(row => row.valid).length }));
}

await audit().catch(() => {
  console.error('Coverage audit stopped before completion');
  process.exitCode = 1;
});
