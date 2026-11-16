// Conservative player role-change signal based only on completed games.
// Diagnostic helper only: not wired into production projections until a longer
// out-of-sample evaluation demonstrates a robust gain.
const ew = (xs, half) => {
  let sum = 0, weight = 0;
  xs.forEach((x, i) => { const w = Math.pow(0.5, (xs.length - 1 - i) / half); sum += x * w; weight += w; });
  return weight ? sum / weight : null;
};

/** Compare recent minutes with the player's season-to-date average. */
export function roleMinutes(rows, { threshold = 2, blend = 0.75, minGames = 4, halfLife = 3 } = {}) {
  const mins = (rows || []).filter(r => r[7] > 0).map(r => r[7] / 60);
  if (mins.length < minGames) return null;
  const season = mins.reduce((a, b) => a + b, 0) / mins.length;
  const recent = ew(mins, halfLife);
  const delta = recent - season;
  const state = delta >= threshold ? 'increasing' : delta <= -threshold ? 'decreasing' : 'stable';
  const adjusted = season + (state === 'stable' ? 0 : blend * delta);
  return { state, season: +season.toFixed(3), recent: +recent.toFixed(3), delta: +delta.toFixed(3), minutes: +adjusted.toFixed(3), triggered: state !== 'stable' };
}
