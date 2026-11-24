import { execFileSync } from 'node:child_process';

// Audio: narration segments placed at their timeline start, plus a music bed generated in code
// (no third-party music, no rights needed), ducked under the voice, normalised to the target LUFS.

export function musicBed(out, secs) {
  const d = Math.max(1, secs).toFixed(2);
  // soft four-on-the-floor + pad, 96 BPM; synthesised with ffmpeg's aevalsrc
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error',
    '-f', 'lavfi', '-i', `aevalsrc='0.8*sin(2*PI*(48+90*exp(-mod(t,0.625)*30))*mod(t,0.625))*exp(-mod(t,0.625)*10)':s=48000:d=${d}`,
    '-f', 'lavfi', '-i', `aevalsrc='0.10*(2*random(1)-1)*exp(-mod(t+0.3125,0.625)*45)':s=48000:d=${d}`,
    '-f', 'lavfi', '-i', `aevalsrc='0.05*(sin(2*PI*220*t)+sin(2*PI*261.6*t)+sin(2*PI*329.6*t))*(0.6+0.4*sin(2*PI*0.2*t))':s=48000:d=${d}`,
    '-filter_complex', `[1:a]highpass=f=6000[h];[2:a]lowpass=f=1800[p];[0:a][h][p]amix=inputs=3:normalize=0,alimiter=limit=0.8,afade=t=in:d=0.5,afade=t=out:st=${Math.max(0, secs - 1.5).toFixed(2)}:d=1.5,aformat=sample_rates=48000:channel_layouts=stereo[a]`,
    '-map', '[a]', '-c:a', 'pcm_s16le', out]);
}

export function mixAudio({ timeline, narration, out, music = true, musicVolume = 0.1, loudness = -14, tmpDir }) {
  const files = narration.segments;
  const args = ['-y', '-loglevel', 'error'];
  for (const s of files) args.push('-i', s.file);
  let filter = '';
  const starts = new Map(timeline.segments.map(s => [s.id, s.start]));
  files.forEach((s, i) => { const ms = Math.round(starts.get(s.id) * 1000); filter += `[${i}:a]adelay=${ms}|${ms},aformat=sample_rates=48000:channel_layouts=stereo[n${i}];`; });
  filter += `${files.map((_, i) => `[n${i}]`).join('')}amix=inputs=${files.length}:normalize=0,apad=whole_dur=${timeline.total}[voice];`;
  if (music) {
    const bed = `${tmpDir}/bed.wav`;
    musicBed(bed, timeline.total);
    args.push('-i', bed);
    const m = files.length;
    filter += `[voice]asplit=2[v1][vsc];[${m}:a]volume=${musicVolume}[bed];[bed][vsc]sidechaincompress=threshold=0.02:ratio=6:attack=20:release=400[duck];[v1][duck]amix=inputs=2:normalize=0[mix];`;
  } else filter += `[voice]anull[mix];`;
  filter += `[mix]loudnorm=I=${loudness}:TP=-1.5:LRA=11,atrim=0:${timeline.total},aresample=48000[a]`;
  args.push('-filter_complex', filter, '-map', '[a]', '-c:a', 'pcm_s16le', out);
  execFileSync('ffmpeg', args);
  return out;
}
