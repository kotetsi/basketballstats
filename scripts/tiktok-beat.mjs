// Πρωτότυπη μουσική υπόκρουση για τα βίντεο TikTok (phonk/trap στα 150 BPM), φτιαγμένη από το μηδέν με σύνθεση ήχου:
// δεν χρησιμοποιεί κανένα δείγμα ή τραγούδι τρίτων, άρα δεν έχει θέμα πνευματικών δικαιωμάτων.
// Στα 150 BPM το δέκατο έκτο διαρκεί 0,1΄΄: όσο κάθε παίκτης στο «Σταμάτα το βίντεο», οπότε τα hi-hats χτυπούν σε κάθε αλλαγή.
//   makeBeat({ T0, SL, GAP, END, DUR, seed }) → Buffer WAV (44,1 kHz, stereo, 16-bit)
export const BPM = 150, BEAT = 60 / BPM, SIX = BEAT / 4;

export function makeBeat({ T0, SL, GAP, END, DUR, seed = 1 }) {
  const SR = 44100, N = Math.ceil(DUR * SR), L = new Float32Array(N), R = new Float32Array(N);
  let s = seed % 2147483646 + 1; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const add = (t0, len, fn, gain = 1, pan = 0) => { const a = Math.floor(t0 * SR), n = Math.floor(len * SR); for (let i = 0; i < n && a + i < N; i++) { if (a + i < 0) continue; const v = fn(i / SR) * gain; L[a + i] += v * (1 - pan) ; R[a + i] += v * (1 + pan); } };
  const noise = () => rnd() * 2 - 1;
  // όργανα
  const kick = t => Math.sin(2 * Math.PI * (45 * t + 110 * (1 - Math.exp(-t * 28)) / 28)) * Math.exp(-t * 7);
  const clap = t => { let v = 0; for (const d of [0, .011, .022]) if (t >= d) v += noise() * Math.exp(-(t - d) * 60); return (v * .6 + noise() * Math.exp(-t * 14) * .5) * (t < .25 ? 1 : 0); };
  let hp = 0; const hat = (t, open) => { const x = noise(); const y = x - hp; hp = x; return y * Math.exp(-t * (open ? 18 : 90)); };
  const bass = f => t => { const fr = f * (1 + .6 * Math.exp(-t * 30)); return Math.tanh(1.8 * Math.sin(2 * Math.PI * fr * t)) * Math.min(1, t * 200) * Math.exp(-t * 1.4); };
  const bell = f => t => (Math.sign(Math.sin(2 * Math.PI * f * t)) * .5 + Math.sign(Math.sin(2 * Math.PI * f * 1.48 * t)) * .5) * Math.exp(-t * 16);
  const boom = t => Math.sin(2 * Math.PI * (38 * t + 90 * (1 - Math.exp(-t * 9)) / 9)) * Math.exp(-t * 2.6) + noise() * Math.exp(-t * 9) * .35;
  const riser = len => t => noise() * Math.pow(t / len, 2) * .5 + Math.sin(2 * Math.PI * (200 + 900 * t / len) * t) * Math.pow(t / len, 3) * .25;

  // νότες: Φα# ελάσσονα (phonk), μπάσο και καμπανάκι
  const BASS = [46.25, 46.25, 55.0, 41.2], BELL = [[740, 0], [880, 3], [740, 6], [659, 8], [740, 10], [988, 12], [880, 14]];
  const groove = (from, to, { hats = true, bells = true } = {}) => {
    const bars = Math.ceil((to - from) / (16 * SIX));
    for (let b = 0; b < bars; b++) for (let k = 0; k < 16; k++) {
      const t = from + (b * 16 + k) * SIX; if (t >= to) return;
      if ([0, 7, 10].includes(k)) add(t, .5, kick, .95);
      if (k === 8) add(t, .3, clap, .55);
      if (hats) { const roll = k >= 12 && b % 2 === 1; add(t, .06, x => hat(x, false), k % 4 === 2 ? .32 : .2, .25); if (roll) add(t + SIX / 2, .04, x => hat(x, false), .16, .25); if (k === 6) add(t, .2, x => hat(x, true), .14, -.25); }
      if (k === 0 || k === 7 || k === 10) add(t, k === 0 ? 4 * SIX * 1.9 : 3 * SIX, bass(BASS[b % 4]), .3);
      if (bells) for (const [f, st] of BELL) if (st === k) add(t, .18, bell(f), .1, k % 2 ? .3 : -.3);
    }
  };
  // εισαγωγή: riser μέχρι το πρώτο «Σταμάτα», μετά «βόμβα»
  add(0, T0, riser(T0), .9);
  add(T0 - .001, 2.5, boom, .8);
  // σε κάθε θέση: groove· στην παύση «Κλείδωσε»: σταματούν τα hats/καμπανάκια, χτύπημα
  const SLOT = SL + GAP;
  for (let i = 0; i < 5; i++) { const a = T0 + i * SLOT; groove(a, a + SL); add(a + SL, 1.2, boom, .55); add(a + SL, .25, clap, .35); }
  // κλείσιμο: πιο ήπιο groove μέχρι το τέλος, με fade out
  groove(END, DUR, { hats: true, bells: false });
  // μίξη: ήπιο sidechain από το kick πάνω στο μπάσο δεν χρειάζεται εδώ· soft clip, fade in/out, κανονικοποίηση
  let peak = 0; for (let i = 0; i < N; i++) { const f = Math.min(1, i / (SR * .05), (N - i) / (SR * 1.2)); L[i] = Math.tanh(L[i] * .8) * f; R[i] = Math.tanh(R[i] * .8) * f; peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); }
  const g = peak > 0 ? .89 / peak : 1;
  const buf = Buffer.alloc(44 + N * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
  for (let i = 0; i < N; i++) { buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * g)) * 32767), 44 + i * 4); buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * g)) * 32767), 46 + i * 4); }
  return buf;
}
