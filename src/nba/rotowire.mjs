// NBA: αναμενόμενες πεντάδες και απουσίες από τη δωρεάν σελίδα «NBA Starting Lineups» του Rotowire
// (https://www.rotowire.com/basketball/nba-lineups.php). Καθαρές συναρτήσεις χωρίς εξαρτήσεις.
// Η πλήρης λίστα τραυματιών του Rotowire είναι μόνο για συνδρομητές· η σελίδα των πεντάδων έχει για κάθε αγώνα
// το «MAY NOT PLAY» με κατάσταση (Out, Doubt, Ques, Prob) και πιθανότητα συμμετοχής (is-pct-play-0…100).
export const LINEUPS_URL = 'https://www.rotowire.com/basketball/nba-lineups.php';
/** συντομογραφίες Rotowire → ESPN */
export const ABBR = { NYK: 'NY', GSW: 'GS', NOP: 'NO', SAS: 'SA', UTA: 'UTAH', WAS: 'WSH', PHO: 'PHX' };
const ent = s => String(s).replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ');

function players(ul) {
  const i = ul.search(/lineup__title[^>]*>\s*MAY NOT PLAY/i);
  const part = (h, mnp) => [...h.matchAll(/<li class="lineup__player is-pct-play-(\d+)[^"]*"[^>]*>([\s\S]*?)<\/li>/g)].map(m => ({
    name: ent(/<a title="([^"]+)"/.exec(m[2])?.[1] || ''), pos: /lineup__pos"[^>]*>([^<]*)</.exec(m[2])?.[1]?.trim() || null,
    status: /lineup__inj">([^<]*)</.exec(m[2])?.[1]?.trim() || null, pct: +m[1], mnp })).filter(p => p.name);
  return { starters: part(i < 0 ? ul : ul.slice(0, i), false), mayNotPlay: i < 0 ? [] : part(ul.slice(i), true) };
}

/** σελίδα → [{ away, home, time, confirmed: {away, home}, teams: { <ESPN abbr>: { starters, mayNotPlay } } }] */
export function parseLineups(html) {
  const out = [];
  for (const b of String(html).split(/<div class="lineup is-nba/).slice(1)) {
    const ab = [...b.matchAll(/lineup__abbr">\s*([A-Z]{2,4})\s*</g)].map(m => m[1]);
    if (ab.length < 2) continue;
    const [away, home] = ab.map(a => ABBR[a] || a);
    const ulOf = side => { const k = b.indexOf(`lineup__list is-${side}`); if (k < 0) return ''; const e = b.indexOf('</ul>', k); return b.slice(k, e < 0 ? undefined : e); };
    const vu = ulOf('visit'), hu = ulOf('home');
    out.push({ away, home, time: /lineup__time">([^<]*)</.exec(b)?.[1]?.trim() || null,
      confirmed: { away: /lineup__status is-confirmed/.test(vu), home: /lineup__status is-confirmed/.test(hu) },
      teams: { [away]: players(vu), [home]: players(hu) } });
  }
  return out;
}

/** «Karl-Anthony Towns» και «Karl Anthony Towns Jr.» → ίδιο κλειδί */
export const nameKey = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '').replace(/[^a-z]/g, '');
