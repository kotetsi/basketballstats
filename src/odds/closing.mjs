// «Η αγορά μάς έδωσε δίκιο;» — σύγκριση της τιμής ενός tip με την τελική τιμή της αγοράς
// (τελευταία καταγεγραμμένη απόδοση πριν από το τζάμπολ, από data/odds/history.jsonl).
// Για νίκη: καλύτερη τιμή = μεγαλύτερη απόδοση από το κλείσιμο.
// Για χάντικαπ/σύνολο με διαφορετική γραμμή: η τιμή κλεισίματος μεταφέρεται στη δική μας γραμμή (SLOPE ανά πόντο).

const MAIN = 1.9; // όταν στο ίδιο στιγμιότυπο υπάρχουν πολλές γραμμές, κρατάμε την πιο «ισόπαλη» (κύρια)
export const SLOPE = 0.028; // πιθανότητα ανά πόντο γραμμής κοντά στη μέση

export function indexHistory(text, book = 'stoiximan') {
  const ix = new Map();
  for (const ln of text.split('\n')) {
    if (!ln.includes(`"book":"${book}"`)) continue;
    let r; try { r = JSON.parse(ln); } catch { continue; }
    if (!ix.has(r.event)) ix.set(r.event, []);
    ix.get(r.event).push(r);
  }
  return ix;
}

// Η τελευταία τιμή μιας επιλογής (market/sel) πριν από το τζάμπολ.
export function closingQuote(rows, market, sel, tipoffMs) {
  const xs = (rows || []).filter(r => r.market === market && r.sel === sel && (!tipoffMs || Date.parse(r.seen) <= tipoffMs) && r.price > 1);
  if (!xs.length) return null;
  const last = xs.reduce((m, r) => (r.seen > m ? r.seen : m), '');
  const snap = xs.filter(r => r.seen === last);
  snap.sort((a, b) => Math.abs(a.price - MAIN) - Math.abs(b.price - MAIN));
  return { line: snap[0].line, price: snap[0].price, seen: last };
}

// pick: { kind: 'ml'|'hc'|'tot', side, line, over }, odds: η απόδοση του tip
export function closingMove(rows, pick, odds, tipoffMs) {
  if (!pick || !odds) return null;
  let market, sel;
  if (pick.kind === 'ml') { market = 'ml'; sel = pick.side === 1 ? 'home' : 'away'; }
  else if (pick.kind === 'hc') { market = 'spread'; sel = pick.side === 1 ? 'home' : 'away'; }
  else if (pick.kind === 'tot') { market = 'total'; sel = pick.over ? 'over' : 'under'; }
  else return null;
  const c = closingQuote(rows, market, sel, tipoffMs);
  if (!c) return null;
  // Όταν η γραμμή διαφέρει, «μεταφέρουμε» την τιμή κλεισίματος στη δική μας γραμμή:
  // κάθε πόντος γραμμής ≈ SLOPE πιθανότητας γύρω από τη μέση (πρακτικός κανόνας για μπάσκετ).
  let by = 'price', pts = 0;
  if (market !== 'ml' && c.line != null && pick.line != null && Math.abs(c.line - pick.line) > 1e-9) {
    by = 'line';
    // πόντοι υπέρ μας: χάντικαπ (γραμμή από τη μεριά της επιλογής) και under = μεγαλύτερη γραμμή καλύτερη· over = μικρότερη
    pts = market === 'total' && pick.over ? c.line - pick.line : pick.line - c.line;
  }
  const pAt = Math.min(0.97, Math.max(0.03, 1 / c.price + SLOPE * pts));
  const diff = odds * pAt - 1;
  const eps = 0.005;
  return { by, pts, diff, status: diff > eps ? 'better' : diff < -eps ? 'worse' : 'same', closeLine: c.line, closePrice: c.price };
}
