// Platform-specific packaging: which rendered file, and the title/description/hashtags for it.
// Limits are conservative and editable here; check each platform's current rules before relying on them.
// Publishing itself is NOT implemented: see publish() below.

export const PLATFORMS = {
  tiktok: { label: 'TikTok', format: '9x16', maxSecs: 600, titleMax: 0, descMax: 2200, hashtags: 5, utm: 'tiktok' },
  instagram_reels: { label: 'Instagram Reels', format: '9x16', maxSecs: 180, titleMax: 0, descMax: 2200, hashtags: 5, utm: 'instagram' },
  facebook_reels: { label: 'Facebook Reels', format: '9x16', maxSecs: 90, titleMax: 0, descMax: 2200, hashtags: 5, utm: 'facebook' },
  youtube_shorts: { label: 'YouTube Shorts', format: '9x16', maxSecs: 180, titleMax: 100, descMax: 5000, hashtags: 3, utm: 'youtube' },
  youtube: { label: 'YouTube', format: '16x9', maxSecs: 43200, titleMax: 100, descMax: 5000, hashtags: 3, utm: 'youtube' },
};

const tag = s => '#' + s.replace(/[^\p{L}\p{N}]+/gu, '');

function baseTags(story) {
  const t = ['EuroLeague', 'Basketball'];
  if (story.type === 'leaderboard') t.push('EuroLeagueFantasy', story.data.metricLabel === 'PIR' ? 'PIR' : 'Stats');
  if (story.type === 'comparison') t.push(...story.data.players.map(p => p.name.split(' ').slice(-1)[0]), 'EuroLeagueFantasy');
  if (story.type === 'spotlight') t.push(story.data.player.name.replace(/\s+/g, ''), story.data.player.teamName);
  return [...new Set(t.map(tag))];
}

function hook(story) {
  if (story.type === 'leaderboard') return story.data.scope === 'round' ? `Round ${story.data.round}'s best ${story.data.metricLabel} games` : `EuroLeague ${story.data.metricLabel} leaders`;
  if (story.type === 'comparison') return `${story.data.players[0].name} vs ${story.data.players[1].name}: who wins on the numbers?`;
  return `${story.data.player.name}: last ${story.data.n} games`;
}

export function storyPath(story) {
  if (story.type === 'leaderboard') return `/en/leaders/${{ pir: 'pir', pts: 'points', reb: 'rebounds', ast: 'assists' }[story.data.metric]}/`;
  if (story.type === 'comparison') return '/en/fantasy/compare-players/';
  return `/en/player/${story.data.player.slug}/`;
}

export function platformPackages(production, story, { site = 'https://basketballstats.eu' } = {}) {
  const out = {};
  const durations = Object.fromEntries((production.renders || []).filter(r => r.mode === 'final').map(r => [r.format, r.secs]));
  for (const [id, P] of Object.entries(PLATFORMS)) {
    const link = `${site}${storyPath(story)}?utm_source=${P.utm}&utm_medium=video&utm_campaign=video_factory&utm_content=${encodeURIComponent(production.id)}`;
    const tags = baseTags(story).slice(0, P.hashtags);
    const title = P.titleMax ? hook(story).slice(0, P.titleMax - (id === 'youtube_shorts' ? 8 : 0)) + (id === 'youtube_shorts' ? ' #Shorts' : '') : null;
    const lines = [hook(story) + '.', `Data: official EuroLeague statistics, through round ${story.lastRound}.`, `More stats: ${id === 'tiktok' || id.startsWith('instagram') ? 'link in bio' : link}`, tags.join(' ')];
    const description = lines.join('\n\n').slice(0, P.descMax);
    const secs = durations[P.format];
    const issues = [];
    if (secs == null) issues.push(`no final ${P.format} render yet`);
    else if (secs > P.maxSecs) issues.push(`video is ${secs}s, platform limit ${P.maxSecs}s`);
    out[id] = { platform: P.label, format: P.format, title, description, hashtags: tags, link, captionsFile: 'captions.srt', ready: issues.length === 0, issues };
  }
  return out;
}

/** Placeholder for future publishing integrations. Deliberately disabled. */
export function publish() {
  throw new Error('Automatic publishing is not enabled. It needs explicit approval and verified API permissions per platform (see docs/PUBLISHING.md).');
}
