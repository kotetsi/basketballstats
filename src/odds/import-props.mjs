// Provider-neutral, offline Player Props import. No network access and no source-specific scraping.
const STATS = new Set(['pts', 'reb', 'ast', 'fg3', 'pr', 'pa', 'pra', 'ar']);
const iso = (v, field) => {
  const d = new Date(v);
  if (!v || !Number.isFinite(d.getTime())) throw new Error(`Invalid ${field}: expected an ISO timestamp`);
  return d.toISOString();
};
const finite = (v, field) => {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`Invalid ${field}: expected a number`);
  return n;
};
const optionalPrice = (v, field) => {
  if (v == null || v === '') return null;
  const n = finite(v, field);
  if (n <= 1 || n > 1000) throw new Error(`Invalid ${field}: decimal odds must be > 1 and <= 1000`);
  return n;
};

/**
 * Accepts an explicitly supplied snapshot:
 * { capturedAt, events:[{eventId,home,away,commence,books:[{key,title,upd,props:[{playerId,name,stat,line,over,under,upd}]}]}] }
 * Returns the existing odds pipeline's event/book/props shape. Does not fetch or persist.
 */
export function normalizePropsSnapshot(input, { provider = 'manual', now = Date.now(), maxAgeHours = 72 } = {}) {
  if (!input || !Array.isArray(input.events)) throw new Error('Input must contain an events array');
  const capturedAt = iso(input.capturedAt, 'capturedAt');
  const age = now - new Date(capturedAt).getTime();
  if (age < -5 * 60_000) throw new Error('Snapshot timestamp is in the future');
  if (age > maxAgeHours * 3_600_000) throw new Error(`Snapshot is stale (older than ${maxAgeHours} hours)`);
  const seenEvents = new Set();
  const events = input.events.map((event, ei) => {
    if (!event?.eventId || !event.home || !event.away) throw new Error(`Event ${ei}: eventId, home and away are required`);
    const eventId = String(event.eventId);
    if (seenEvents.has(eventId)) throw new Error(`Duplicate eventId: ${eventId}`);
    seenEvents.add(eventId);
    const commence = iso(event.commence, `events[${ei}].commence`);
    const seenBooks = new Set();
    const books = (event.books || []).map((book, bi) => {
      if (!book?.key || !book?.title) throw new Error(`Event ${eventId}, book ${bi}: key and title are required`);
      const key = String(book.key).toLowerCase().replace(/[^a-z0-9_-]/g, '_');
      if (seenBooks.has(key)) throw new Error(`Duplicate bookmaker ${key} in event ${eventId}`);
      seenBooks.add(key);
      const upd = book.upd ? iso(book.upd, 'book.upd') : capturedAt;
      const seenProps = new Set();
      const props = (book.props || []).map((p, pi) => {
        const stat = String(p.stat || '').toLowerCase();
        if (!STATS.has(stat)) throw new Error(`Unknown stat at ${eventId}/${key}/${pi}: ${stat}`);
        const player = String(p.name || '').trim();
        if (!player) throw new Error('Every prop requires a player name');
        const line = finite(p.line, 'prop.line');
        if (line < 0 || line > 100) throw new Error('prop.line must be between 0 and 100');
        const over = optionalPrice(p.over, 'prop.over');
        const under = optionalPrice(p.under, 'prop.under');
        if (over == null && under == null) throw new Error('A prop needs at least one valid Over/Under price');
        const playerId = p.playerId == null ? null : String(p.playerId);
        const identity = [playerId || player.toLowerCase(), stat, line].join('|');
        if (seenProps.has(identity)) throw new Error(`Duplicate prop: ${identity}`);
        seenProps.add(identity);
        return { playerId, name: player, stat, line, over, under, upd: p.upd ? iso(p.upd, 'prop.upd') : upd };
      });
      return { key, title: String(book.title), upd, markets: { props } };
    });
    return { eventId, home: String(event.home), away: String(event.away), commence, books };
  });
  return { provider: String(provider), capturedAt, events };
}
