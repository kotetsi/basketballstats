// Ελάχιστο D1 (Cloudflare) πάνω σε node:sqlite, για να τρέχει ο Worker του PRO στα tests χωρίς δίκτυο.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';

class Stmt {
  constructor(db, sql, args = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...a) { return new Stmt(this.db, this.sql, a); }
  async first() { return this.db.prepare(this.sql).get(...this.args) ?? null; }
  async all() { return { results: this.db.prepare(this.sql).all(...this.args), success: true }; }
  async run() { const r = this.db.prepare(this.sql).run(...this.args); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }
}
export function makeD1(schemaPath) {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(schemaPath, 'utf8'));
  return { prepare: sql => new Stmt(db, sql), batch: async st => Promise.all(st.map(s => s.run())), exec: async sql => db.exec(sql), raw: db };
}
