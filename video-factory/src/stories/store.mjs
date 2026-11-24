import fs from 'node:fs';
import path from 'node:path';

// Stories are JSON files in video-factory/stories/. Only status "approved" stories can be produced.
// Any source (this dashboard's builder, a future Data Studio, a hand-written file) writes the same shape.

const safe = id => { if (!/^[a-z0-9][a-z0-9._-]{0,120}$/i.test(id)) throw new Error('invalid id'); return id; };

export class StoryStore {
  constructor(dir) { this.dir = dir; fs.mkdirSync(dir, { recursive: true }); }
  file(id) { return path.join(this.dir, `${safe(id)}.json`); }
  list() {
    return fs.readdirSync(this.dir).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(this.dir, f), 'utf8')))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }
  get(id) { const f = this.file(id); try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } }
  save(story) { fs.writeFileSync(this.file(story.id), JSON.stringify(story, null, 2) + '\n'); return story; }
  approve(id, by = 'admin') {
    const s = this.get(id); if (!s) throw new Error('story not found');
    Object.assign(s, { status: 'approved', approvedAt: new Date().toISOString(), approvedBy: by });
    return this.save(s);
  }
}

export function requireApproved(story) {
  if (!story) throw new Error('story not found');
  if (story.status !== 'approved') throw new Error(`story "${story.id}" is not approved (status: ${story.status})`);
  return story;
}
