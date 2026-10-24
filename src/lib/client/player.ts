"use client";

import type { SegmentRole } from "../protocol";

// Plays the answer's spoken pieces in order as they arrive (they can arrive out of order), the way a
// person explains: each piece trimmed to the voice, faded in and out, evened out in loudness, and
// followed by a calm pause — longest after each step. Pieces are scheduled on the audio clock, so the
// rhythm stays even, and loudness is reported so the mascot's mouth moves with the voice.

type Listener = { onStart?: (index: number) => void; onIdle?: () => void };

interface Clip {
  buffer: AudioBuffer;
  offset: number;
  duration: number;
  gain: number;
}

/** Pause after each kind of piece, in seconds at normal speed. */
const PAUSE: Record<SegmentRole | "clip", number> = { clip: 0.3, intro: 0.55, step: 0.85, warning: 0.6, closing: 0 };

const SILENCE = 0.012; // about -38 dBFS
const TARGET_RMS = 0.16; // about -16 dBFS, the level Sarvam's clips sit around
const FADE_IN = 0.012;
const FADE_OUT = 0.03;

/** Where the voice starts and ends, and how much to turn it up or down. */
function analyse(buffer: AudioBuffer): Clip {
  const d = buffer.getChannelData(0);
  const rate = buffer.sampleRate;
  let a = 0;
  while (a < d.length && Math.abs(d[a]) < SILENCE) a++;
  let b = d.length - 1;
  while (b > a && Math.abs(d[b]) < SILENCE) b--;
  if (b <= a) return { buffer, offset: 0, duration: buffer.duration, gain: 1 };
  let sum = 0;
  let peak = 0;
  for (let i = a; i <= b; i++) {
    sum += d[i] * d[i];
    peak = Math.max(peak, Math.abs(d[i]));
  }
  const rms = Math.sqrt(sum / (b - a + 1));
  const offset = Math.max(0, a / rate - 0.03);
  const end = Math.min(buffer.duration, b / rate + 0.06);
  return { buffer, offset, duration: end - offset, gain: Math.min(TARGET_RMS / rms, 0.95 / peak, 2) };
}

export class Player {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private clips = new Map<number, Clip>();
  private roles = new Map<number, SegmentRole>();
  private failed = new Set<number>();
  private next = 0; // next piece to schedule
  private last: number | null = null; // index of the final piece, once known
  private nextAt = 0; // audio-clock time the next piece may start
  private live: { src: AudioBufferSourceNode; timer: ReturnType<typeof setTimeout> }[] = [];
  private playing = false;
  private only: number | null = null; // replaying a single piece
  private pace = 1;
  private generation = 0; // bumped on every stop, so stale callbacks do nothing
  private levels = new Float32Array(512);
  listener: Listener = {};

  /** Must run inside a tap, so phones allow sound later. */
  unlock() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.master = this.ctx.createGain();
      this.master.connect(this.analyser).connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    const s = this.ctx.createBufferSource();
    s.buffer = this.ctx.createBuffer(1, 1, 22050);
    s.connect(this.ctx.destination);
    s.start();
  }

  /** Slower speech gets longer pauses too. */
  setPace(pace: number) {
    this.pace = pace > 0 ? pace : 1;
  }

  /** Forget the previous answer and play the new one as its pieces arrive. */
  start() {
    this.stop();
    this.clips.clear();
    this.roles.clear();
    this.failed.clear();
    this.last = null;
    this.only = null;
    this.next = 0;
    this.nextAt = 0;
    this.playing = true;
  }

  /** What kind of piece `index` is, which decides the pause after it. */
  setRole(index: number, role: SegmentRole) {
    this.roles.set(index, role);
  }

  async add(index: number, data: ArrayBuffer) {
    if (!this.ctx) return;
    try {
      this.clips.set(index, analyse(await this.ctx.decodeAudioData(data)));
    } catch {
      this.failed.add(index);
    }
    this.pump();
  }

  addBase64(index: number, b64: string) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return this.add(index, bytes.buffer);
  }

  skip(index: number) {
    this.failed.add(index);
    this.pump();
  }

  /** The answer has `count` pieces in total. */
  setCount(count: number) {
    this.last = count - 1;
    this.pump();
  }

  has(index: number) {
    return this.clips.has(index);
  }

  /** A short line that is not part of the answer. A filler ("जी, देखती हूँ") plays only if the answer
   *  hasn't started yet; `now` (voice previews) stops whatever is playing and plays it straight away. */
  playClip(source: string | ArrayBuffer, now = false) {
    if (!this.ctx) return;
    if (now) this.stop();
    const generation = this.generation;
    const data = typeof source === "string" ? fetch(source).then((r) => r.arrayBuffer()) : Promise.resolve(source);
    data
      .then((d) => this.ctx!.decodeAudioData(d))
      .then((buffer) => {
        if (generation !== this.generation) return; // stopped meanwhile
        if (!now && (this.live.length || this.next > 0)) return; // the answer already began
        this.schedule(analyse(buffer), null, "clip");
      })
      .catch(() => {}); // a missing clip isn't worth interrupting anything for
  }

  replayAll() {
    this.stop();
    this.only = null;
    this.next = 0;
    this.playing = true;
    this.pump();
  }

  replay(index: number) {
    if (!this.clips.has(index)) return;
    this.stop();
    this.only = index;
    this.next = index;
    this.playing = true;
    this.pump();
  }

  stop() {
    this.generation++;
    this.playing = false;
    for (const { src, timer } of this.live) {
      clearTimeout(timer);
      src.onended = null;
      try {
        src.stop();
      } catch {
        // not started yet or already stopped
      }
    }
    this.live = [];
    this.nextAt = 0;
  }

  /** Current loudness 0..1 (near 0 in the pauses, so the mouth closes between steps). */
  level(): number {
    if (!this.analyser || !this.live.length) return 0;
    this.analyser.getFloatTimeDomainData(this.levels);
    let sum = 0;
    for (const v of this.levels) sum += v * v;
    return Math.min(1, Math.sqrt(sum / this.levels.length) * 5);
  }

  private pump() {
    if (!this.playing || !this.ctx) return;
    for (;;) {
      if (this.only !== null && this.next !== this.only) break;
      if (this.failed.has(this.next)) {
        this.next++;
        continue;
      }
      if (this.last !== null && this.next > this.last) break;
      const clip = this.clips.get(this.next);
      if (!clip) break; // not arrived yet; it is scheduled the moment it does
      const index = this.next;
      this.schedule(clip, index, this.roles.get(index) ?? "step");
      this.next = this.only !== null ? Number.MAX_SAFE_INTEGER : index + 1;
    }
    this.maybeIdle();
  }

  private schedule(clip: Clip, index: number | null, role: SegmentRole | "clip") {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const when = Math.max(now + 0.03, this.nextAt);
    const end = when + clip.duration;

    const src = ctx.createBufferSource();
    src.buffer = clip.buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(clip.gain, when + FADE_IN);
    gain.gain.setValueAtTime(clip.gain, Math.max(when + FADE_IN, end - FADE_OUT));
    gain.gain.linearRampToValueAtTime(0, end);
    src.connect(gain).connect(this.master!);
    src.start(when, clip.offset, clip.duration);

    const generation = this.generation;
    const timer = setTimeout(() => {
      if (generation === this.generation && index !== null) this.listener.onStart?.(index);
    }, Math.max(0, (when - now) * 1000));
    const entry = { src, timer };
    this.live.push(entry);
    src.onended = () => {
      this.live = this.live.filter((e) => e !== entry);
      if (generation === this.generation) this.maybeIdle();
    };
    this.nextAt = end + PAUSE[role] / this.pace;
    debugLog({ index, role, when: +when.toFixed(3), duration: +clip.duration.toFixed(3), gain: +clip.gain.toFixed(2) });
  }

  private maybeIdle() {
    if (!this.playing || this.live.length) return;
    const finished = this.only !== null ? this.next === Number.MAX_SAFE_INTEGER : this.last !== null && this.next > this.last;
    if (!finished) return;
    this.playing = false;
    this.listener.onIdle?.();
  }
}

/** Tests can set `window.__sakhiAudioLog = []` to see what was scheduled when. */
function debugLog(entry: object) {
  const log = (globalThis as { __sakhiAudioLog?: object[] }).__sakhiAudioLog;
  log?.push(entry);
}
