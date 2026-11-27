// Leakage-safe probability calibration helpers for player-prop over probabilities.
export const clampProbability = p => Math.min(1 - 1e-6, Math.max(1e-6, Number(p)));

export function fitLogisticCalibration(samples, ridge = 1) {
  if (!Array.isArray(samples) || samples.length < 30) return null;
  let a = 0, b = 1;
  for (let iter = 0; iter < 100; iter++) {
    let g0 = 0, g1 = ridge * (b - 1), h00 = 1e-8, h01 = 0, h11 = ridge + 1e-8;
    for (const s of samples) {
      const x = Math.log(clampProbability(s.p) / (1 - clampProbability(s.p)));
      const z = Math.max(-20, Math.min(20, a + b * x));
      const q = 1 / (1 + Math.exp(-z));
      const w = q * (1 - q);
      g0 += q - s.y; g1 += (q - s.y) * x;
      h00 += w; h01 += w * x; h11 += w * x * x;
    }
    const det = h00 * h11 - h01 * h01;
    if (!(det > 1e-12)) return null;
    const da = (h11 * g0 - h01 * g1) / det;
    const db = (-h01 * g0 + h00 * g1) / det;
    a -= da; b -= db;
    if (Math.abs(da) + Math.abs(db) < 1e-7) break;
  }
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return { method: 'logistic', intercept: a, slope: b };
}
export function applyLogisticCalibration(p, model) {
  const x = Math.log(clampProbability(p) / (1 - clampProbability(p)));
  const z = Math.max(-20, Math.min(20, model.intercept + model.slope * x));
  return clampProbability(1 / (1 + Math.exp(-z)));
}

// Pool-adjacent-violators algorithm. Each observation is one probability/over outcome.
export function fitIsotonicCalibration(samples, minBin = 20) {
  if (!Array.isArray(samples) || samples.length < 60) return null;
  const sorted = samples.map(s => ({ x: clampProbability(s.p), y: s.y ? 1 : 0, n: 1 }))
    .sort((a, b) => a.x - b.x);
  const blocks = [];
  for (const point of sorted) {
    blocks.push({ lo: point.x, hi: point.x, sum: point.y, n: 1 });
    while (blocks.length > 1) {
      const right = blocks.at(-1), left = blocks.at(-2);
      if (left.sum / left.n <= right.sum / right.n) break;
      blocks.splice(-2, 2, { lo: left.lo, hi: right.hi, sum: left.sum + right.sum, n: left.n + right.n });
    }
  }
  // Merge sparse adjacent blocks so the fitted curve is not driven by single outcomes.
  for (let i = 0; i < blocks.length - 1;) {
    if (blocks[i].n >= minBin && blocks[i + 1].n >= minBin) { i++; continue; }
    const left = blocks[i], right = blocks[i + 1];
    blocks.splice(i, 2, { lo: left.lo, hi: right.hi, sum: left.sum + right.sum, n: left.n + right.n });
    if (i > 0) i--;
  }
  return { method: 'isotonic', knots: blocks.map(b => ({ x: (b.lo + b.hi) / 2, y: clampProbability(b.sum / b.n), n: b.n })) };
}
export function applyIsotonicCalibration(p, model) {
  const x = clampProbability(p), knots = model.knots;
  if (!knots?.length) return x;
  if (x <= knots[0].x) return knots[0].y;
  if (x >= knots.at(-1).x) return knots.at(-1).y;
  let i = 1;
  while (i < knots.length && knots[i].x < x) i++;
  const l = knots[i - 1], r = knots[i], t = (x - l.x) / Math.max(1e-12, r.x - l.x);
  return clampProbability(l.y + t * (r.y - l.y));
}
export function applyCalibration(p, model) {
  return model.method === 'logistic' ? applyLogisticCalibration(p, model) : applyIsotonicCalibration(p, model);
}
export function scoreProbabilities(samples) {
  if (!samples.length) return { n: 0, logLoss: null, brier: null };
  let ll = 0, bs = 0;
  for (const s of samples) {
    const p = clampProbability(s.p);
    ll -= s.y ? Math.log(p) : Math.log(1 - p);
    bs += (p - s.y) ** 2;
  }
  return { n: samples.length, logLoss: +(ll / samples.length).toFixed(6), brier: +(bs / samples.length).toFixed(6) };
}
