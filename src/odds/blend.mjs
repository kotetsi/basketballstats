// Οι πιθανότητες που δείχνει το site: μίξη μοντέλου και αγοράς.
// Backtest 3 σεζόν EuroLeague (921 αγώνες, Flashscore closing): log loss μοντέλο 0.622, αγορά 0.608, 30/70 μίξη 0.610.
// Το μοντέλο μόνο του είναι υπερβολικά σίγουρο· η μίξη δίνει σχεδόν τις πιθανότητες της αγοράς, με μια μικρή κλίση από το μοντέλο.
import { marketSnap } from './ledger.mjs';

export const W_MODEL = 0.3;

/** Μεταβάλλει τα games: κρατά p_model (ωμό μοντέλο), p_mkt, και βάζει p_home/p_away = μίξη. Μόνο EuroLeague, μόνο φρέσκες τιμές, μόνο πριν το τζάμπολ. */
export function blendPreds(preds, oddsLatest, reg, { w = W_MODEL, now = Date.now(), staleH = 12 } = {}) {
  const upd = oddsLatest?.updated ? new Date(oddsLatest.updated).getTime() : null;
  const fresh = upd != null && (now - upd) / 36e5 <= staleH;
  let n = 0;
  for (const g of preds?.games || []) {
    if (g.p_home == null) continue;
    g.p_model = g.p_home;
    if (g.comp !== 'E' || !fresh || (g.t && new Date(g.t) <= now)) continue;
    const m = marketSnap(oddsLatest?.games?.[`E-${g.r}-${g.h}-${g.a}`], reg);
    if (m?.p == null) continue;
    g.p_mkt = m.p;
    g.p_home = Math.round((w * g.p_model + (1 - w) * m.p) * 1e4) / 1e4;
    g.p_away = Math.round((1 - g.p_home) * 1e4) / 1e4;
    n++;
  }
  return n;
}
