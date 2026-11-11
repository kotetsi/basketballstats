// One-request, read-only historical availability probe. Never prints the API key or raw response.
const key = process.env.ODDS_API_KEY;
if (!key) { console.error('ODDS_API_KEY is missing'); process.exitCode = 1; }
else {
  const fixtureId = process.env.FIXTURE_ID || 'id1100013873263138';
  const base = 'https://api.oddspapi.io/v4/historical-odds';
  const params = new URLSearchParams({ apiKey: key, fixtureId, bookmakers: 'stoiximan,bet365.gr' });
  try {
    const response = await fetch(base + '?' + params, { signal: AbortSignal.timeout(20000) });
    const body = await response.text();
    let parsed; try { parsed = JSON.parse(body); } catch { parsed = null; }
    const summary = { status: response.status, fixtureId, json: parsed !== null };
    if (parsed && typeof parsed === 'object') {
      summary.topLevelKeys = Object.keys(parsed).slice(0, 20);
      summary.isArray = Array.isArray(parsed);
      summary.count = Array.isArray(parsed) ? parsed.length : null;
      summary.errorCode = parsed.code ?? parsed.errorCode ?? null;
      // No raw provider payloads: some services echo request URLs and credentials in errors.
    }
    console.log(JSON.stringify(summary));
    if (!response.ok) process.exitCode = 1;
  } catch (error) {
    console.error('Historical probe failed:', error.name);
    process.exitCode = 1;
  }
}
