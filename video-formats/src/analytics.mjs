import fs from 'node:fs';
import path from 'node:path';

// Performance by format, from Video Factory production metadata (performance entered per
// platform after publishing). Recommendations need a minimum sample; otherwise "not enough data".

export const MIN_SAMPLE = 3;

export function loadProductions(dir) {
  try {
    return fs.readdirSync(dir).map(d => { try { return JSON.parse(fs.readFileSync(path.join(dir, d, 'production.json'), 'utf8')); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

export function performanceByFormat(productionsDir, formats = []) {
  const P = loadProductions(productionsDir).filter(p => p.format || p.story?.format);
  const by = {};
  for (const p of P) {
    const id = p.format || p.story.format;
    const a = (by[id] ||= { format: id, productions: 0, published: 0, views: 0, watchWeighted: 0, completion: [], shares: 0, comments: 0, likes: 0, siteSessions: 0, registrations: 0, platforms: {} });
    a.productions++;
    if (p.publication?.publishedTo?.length) a.published++;
    for (const [plat, m] of Object.entries(p.performance || {})) {
      a.views += m.views || 0; a.watchWeighted += (m.avgWatchSecs || 0) * (m.views || 0);
      if (m.completionRate != null) a.completion.push(m.completionRate);
      a.shares += m.shares || 0; a.comments += m.comments || 0; a.likes += m.likes || 0;
      a.siteSessions += m.siteSessions || 0; a.registrations += m.registrations || 0;
      a.platforms[plat] = (a.platforms[plat] || 0) + (m.views || 0);
    }
  }
  const rows = Object.values(by).map(a => ({
    format: a.format, name: formats.find(f => f.id === a.format)?.name || a.format, productions: a.productions, published: a.published, views: a.views,
    avgWatchSecs: a.views ? Math.round((a.watchWeighted / a.views) * 10) / 10 : null,
    completionRate: a.completion.length ? Math.round((a.completion.reduce((s, x) => s + x, 0) / a.completion.length) * 10) / 10 : null,
    shares: a.shares, comments: a.comments, engagementRate: a.views ? Math.round(((a.likes + a.comments + a.shares) / a.views) * 1000) / 10 : null,
    siteSessions: a.siteSessions, registrations: a.registrations, viewsPerVideo: a.published ? Math.round(a.views / a.published) : null, platforms: a.platforms,
  }));
  const withData = rows.filter(r => r.published >= MIN_SAMPLE && r.engagementRate != null);
  const med = withData.length ? [...withData].map(r => r.engagementRate).sort((x, y) => x - y)[Math.floor(withData.length / 2)] : null;
  for (const r of rows) {
    r.relative = med && r.engagementRate != null && r.published >= MIN_SAMPLE ? Math.round((r.engagementRate / med) * 100) / 100 : null;
    r.recommendation = r.published < MIN_SAMPLE ? `not enough data (${r.published}/${MIN_SAMPLE} published)` : r.relative >= 1.2 ? 'invest more: engagement well above the median format' : r.relative <= 0.7 ? 'rethink or reduce: engagement well below the median' : 'keep: around the median';
  }
  return { generatedAt: new Date().toISOString(), minSample: MIN_SAMPLE, medianEngagementRate: med, formats: rows.sort((a, b) => (b.relative ?? -1) - (a.relative ?? -1) || b.views - a.views), note: 'Past performance describes what happened; it does not guarantee future results.' };
}

export const perfIndex = report => Object.fromEntries(report.formats.map(r => [r.format, r]));
