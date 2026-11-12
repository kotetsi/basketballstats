// Make one read-only request and log only derived counts and known error codes.
const key = process.env.ODDS_API_KEY;
const fixtureId = process.env.FIXTURE_ID || 'id1100013873263138';
const bookmakers = ['stoiximan', 'bet365.gr'];
const knownErrors = new Set([
  'INVALID_PARAMETER', 'RATE_LIMITED', 'REQUEST_LIMIT_EXCEEDED',
  'UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'INVALID_API_KEY',
]);

function summarize(bookmaker) {
  let marketsWithHistory = 0;
  let snapshots = 0;
  for (const market of Object.values(bookmaker?.markets ?? {})) {
    let marketSnapshots = 0;
    for (const outcome of Object.values(market?.outcomes ?? {})) {
      for (const history of Object.values(outcome?.players ?? {})) {
        if (!Array.isArray(history)) continue;
        marketSnapshots += history.filter(entry =>
          Number.isFinite(entry?.price) && typeof entry.createdAt === 'string' &&
          Number.isFinite(Date.parse(entry.createdAt))
        ).length;
      }
    }
    marketsWithHistory += Number(marketSnapshots > 0);
    snapshots += marketSnapshots;
  }
  return { marketsWithHistory, snapshots };
}

async function probe() {
  if (!key || !/^id\d+$/.test(fixtureId)) {
    console.error(key ? 'Invalid fixture ID' : 'ODDS_API_KEY is missing');
    process.exitCode = 1;
    return;
  }

  const url = new URL('https://api.oddspapi.io/v4/historical-odds');
  url.search = new URLSearchParams({ apiKey: key, fixtureId, bookmakers: bookmakers.join(',') });
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
  const payload = await response.json().catch(() => null);
  const fixtureMatches = payload?.fixtureId === fixtureId;
  const hasBookmakerMap = payload?.bookmakers != null &&
    typeof payload.bookmakers === 'object' && !Array.isArray(payload.bookmakers);
  const code = payload?.error?.code ?? payload?.code ?? payload?.errorCode;
  const summary = {
    status: response.status,
    fixtureId,
    fixtureMatches,
    hasBookmakerMap,
    errorCode: knownErrors.has(code) ? code : null,
  };
  if (response.status === 200 && fixtureMatches && hasBookmakerMap) {
    summary.bookmakers = Object.fromEntries(bookmakers.map(slug => [
      slug, summarize(payload.bookmakers[slug]),
    ]));
  } else {
    process.exitCode = 1;
  }
  console.log(JSON.stringify(summary));
}

await probe().catch(() => {
  console.error('Historical probe failed before producing a summary');
  process.exitCode = 1;
});
