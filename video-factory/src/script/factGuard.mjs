// Every number in a script must come from the story's data (or be a rank/count/year).
const NUM = /(?<![\w.])\d+(?:[.,]\d+)?(?![\w])/g;
const r1 = x => Math.round(x * 10) / 10;

export function allowedNumbers(data, extra = []) {
  const s = new Set();
  const add = v => { const x = +v; if (!Number.isFinite(x)) return; for (const t of [x, r1(x), Math.round(x)]) s.add(String(t)); s.add(x.toFixed(1)); };
  const walk = v => {
    if (typeof v === 'number') add(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(data); extra.forEach(add);
  return s;
}

export function checkNumbers(text, allowed) {
  const clean = String(text).replace(/https?:\/\/\S+|basketballstats\.eu/gi, ' ');
  const bad = [];
  for (const m of clean.matchAll(NUM)) {
    const raw = m[0].replace(',', '.'), n = String(+raw);
    if (allowed.has(raw) || allowed.has(n)) continue;
    if (/^(19|20)\d\d$/.test(n)) continue;
    bad.push(m[0]);
  }
  return { ok: bad.length === 0, unsupported: bad };
}

export function checkScript(script, story) {
  const allowed = allowedNumbers(story.data, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const unsupported = script.segments.flatMap(s => checkNumbers(s.text, allowed).unsupported.concat(checkNumbers(s.say || '', allowed).unsupported));
  return { ok: unsupported.length === 0, unsupported: [...new Set(unsupported)] };
}
