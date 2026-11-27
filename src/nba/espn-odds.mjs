// Ιστορικές γραμμές NBA από το ESPN (core API, πάροχος ESPN BET): άνοιγμα και κλείσιμο νικητή, χάντικαπ γηπεδούχου, σύνολο.
// Δημόσια, δωρεάν δεδομένα· μόνο για μέτρηση του μοντέλου απέναντι στην αγορά.
export const oddsUrl = id => `https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/events/${id}/competitions/${id}/odds`;
const am2dec = a => { const x = +String(a ?? '').replace('+', ''); return !x || Number.isNaN(x) ? null : x > 0 ? 1 + x / 100 : 1 + 100 / -x; };
const dec = o => o ? (o.decimal > 1 ? +o.decimal : am2dec(o.american ?? o.alternateDisplayValue)) : null;
const num = s => { const x = parseFloat(String(s ?? '').replace('+', '')); return Number.isNaN(x) ? null : x; };

/** → [mlH, mlA, mlOpenH, mlOpenA, spreadHome, total] (δεκαδικές αποδόσεις, null όπου λείπει) ή null */
export function parseOdds(j) {
  const it = (j?.items || []).find(x => x.provider?.id === '58') || j?.items?.[0];
  if (!it) return null;
  const H = it.homeTeamOdds || {}, A = it.awayTeamOdds || {};
  const mlH = dec(H.close?.moneyLine) ?? am2dec(H.moneyLine), mlA = dec(A.close?.moneyLine) ?? am2dec(A.moneyLine);
  const sp = num(H.close?.pointSpread?.american ?? H.close?.pointSpread?.alternateDisplayValue);
  const r = v => v == null ? null : +v.toFixed(3);
  const out = [r(mlH), r(mlA), r(dec(H.open?.moneyLine)), r(dec(A.open?.moneyLine)), sp, it.overUnder ?? null];
  return out.some(v => v != null) ? out : null;
}
