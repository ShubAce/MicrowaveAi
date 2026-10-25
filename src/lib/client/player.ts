"use client";

import type { SegmentRole } from "../protocol";

// Plays the answer's spoken pieces in order as they arrive (they can arrive out of order), the way a
// person explains: each piece trimmed to the voice, faded in and out, evened out in loudness, and
// followed by a calm pause — longest after each step. Pieces are scheduled on the audio clock, so the
// rhythm stays even, and loudness is reported so the mascot's mouth moves with the voice.

type Listener = { onStart?: (index: number) => void; onIdle?: () => void };

interface Cue {
  index: number;
  when: number;
}

interface Clip {
  buffer: AudioBuffer;
  offset: number;
  duration: number;
  gain: number;
}

/** One answer's pieces. Calls for an answer that has since been replaced by a newer one do nothing,
 *  so late audio from a previous question can never play under the current one. */
export interface AnswerAudio {
  /** What kind of piece `index` is, which decides the pause after it. */
  setRole(index: number, role: SegmentRole): void;
  add(index: number, data: ArrayBuffer): Promise<void>;
  addBase64(index: number, b64: string): Promise<void>;
  /** This piece has no audio; carry on without it. */
  skip(index: number): void;
  /** The answer has `count` pieces in total. */
  setCount(count: number): void;
}

/** Pause after each kind of piece, in seconds at normal speed. */
const PAUSE: Record<SegmentRole | "clip", number> = { clip: 0.3, intro: 0.55, step: 0.85, warning: 0.6, closing: 0 };

const SILENCE = 0.012; // about -38 dBFS
const TARGET_RMS = 0.16; // about -16 dBFS, the level Sarvam's clips sit around
const FADE_IN = 0.012;
const FADE_OUT = 0.03;
const DONE = Number.MAX_SAFE_INTEGER; // `next` once a single replayed piece is scheduled

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

function base64ToBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
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
  private live: { src: AudioBufferSourceNode; index: number | null; cue: Cue | null }[] = [];
  private cues: Cue[] = []; // pieces waiting to be lit up
  private cueFrame = 0;
  private playing = false;
  private only: number | null = null; // replaying a single piece...
  private resumeAt: number | null = null; // ...and then carrying on from here
  private answerAt = 0; // the piece the answer is on: moves on only when a piece played in order ends
  private halted = false; // she pressed रोकें: a tap on a card won't carry on with the rest
  private answer = 0; // bumped for every new answer
  private pace = 1;
  private generation = 0; // bumped on every stop, so stale callbacks do nothing
  private cache = new Map<string, Promise<Clip>>();
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
      // Phones pause the audio when the screen locks or a call comes in; pick it up again when she's back.
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") this.resume();
      });
    }
    this.resume();
    const s = this.ctx.createBufferSource();
    s.buffer = this.ctx.createBuffer(1, 1, 22050);
    s.connect(this.ctx.destination);
    s.start();
  }

  /** Safari can also report "interrupted", so resume from anything but running or closed. */
  private resume() {
    const state = this.ctx?.state as string | undefined;
    if (state && state !== "running" && state !== "closed") this.ctx!.resume().catch(() => {});
  }

  /** Slower speech gets longer pauses too. */
  setPace(pace: number) {
    this.pace = pace > 0 ? pace : 1;
  }

  /** Forget the previous answer and play a new one as its pieces arrive. */
  start(): AnswerAudio {
    this.stop();
    this.clips.clear();
    this.roles.clear();
    this.failed.clear();
    this.last = null;
    this.only = null;
    this.resumeAt = null;
    this.answerAt = 0;
    this.halted = false;
    this.next = 0;
    this.playing = true;
    const id = ++this.answer;
    const current = () => id === this.answer;

    const add = async (index: number, data: ArrayBuffer) => {
      if (!current() || !this.ctx) return;
      let clip: Clip | null = null;
      try {
        clip = analyse(await this.ctx.decodeAudioData(data));
      } catch {
        // unreadable audio: the piece is skipped
      }
      if (!current()) return; // a newer answer started while this was decoding
      if (clip) this.clips.set(index, clip);
      else this.failed.add(index);
      this.pump();
    };

    return {
      setRole: (index, role) => {
        if (current()) this.roles.set(index, role);
      },
      add,
      addBase64: (index, b64) => add(index, base64ToBuffer(b64)),
      skip: (index) => {
        if (!current()) return;
        this.failed.add(index);
        this.pump();
      },
      setCount: (count) => {
        if (!current()) return;
        this.last = count - 1;
        this.pump();
      },
    };
  }

  has(index: number) {
    return this.clips.has(index);
  }

  /** A short line that is not part of the answer: a clip's URL, or speech still being fetched.
   *  A filler ("जी, देखती हूँ") plays only if the answer hasn't started yet. `now` (voice previews)
   *  stops whatever is playing straight away and plays the line when it arrives, unless something
   *  new started in the meantime. */
  playClip(source: string | Promise<ArrayBuffer>, now = false) {
    if (!this.ctx) return;
    if (now) this.stop();
    const generation = this.generation;
    const answer = this.answer;
    this.decodeClip(source)
      .then((clip) => {
        if (generation !== this.generation || answer !== this.answer) return; // stopped or replaced meanwhile
        if (!now && (this.live.length || this.next > 0)) return; // the answer already began
        this.schedule(clip, null, "clip");
      })
      .catch(() => {}); // a missing clip isn't worth interrupting anything for
  }

  /** Fetches and decodes clips ahead of time, so they still play if the internet drops later. */
  preload(urls: string[]) {
    if (!this.ctx) return;
    for (const url of urls) this.decodeClip(url).catch(() => {});
  }

  private decodeClip(source: string | Promise<ArrayBuffer>): Promise<Clip> {
    const ctx = this.ctx!;
    if (typeof source !== "string") return source.then((d) => ctx.decodeAudioData(d)).then(analyse);
    let clip = this.cache.get(source);
    if (!clip) {
      clip = fetch(source)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((d) => ctx.decodeAudioData(d))
        .then(analyse);
      this.cache.set(source, clip);
      clip.catch(() => this.cache.delete(source)); // try again next time
    }
    return clip;
  }

  replayAll() {
    this.stop();
    this.answerAt = 0;
    this.only = null;
    this.resumeAt = null;
    this.halted = false;
    this.next = 0;
    this.playing = true;
    this.pump();
  }

  /** She tapped a piece. A piece she has already heard is played again, and then the answer carries
   *  on where it was; the piece being spoken or a later one plays from there on. Once the whole
   *  answer has been heard (or she stopped it), only the tapped piece plays. */
  replay(index: number) {
    if (!this.clips.has(index)) return;
    const resumeAt = this.answerAt;
    const unfinished = !this.halted && (this.last === null || resumeAt <= this.last);
    this.stop();
    this.playing = true;
    this.next = index;
    if (unfinished && index >= resumeAt) {
      this.only = null;
      this.resumeAt = null;
      this.answerAt = index;
    } else {
      this.only = index;
      this.resumeAt = unfinished ? resumeAt : null;
    }
    this.pump();
  }

  /** She pressed रोकें. */
  halt() {
    this.stop();
    this.halted = true;
  }

  stop() {
    this.generation++;
    this.playing = false;
    for (const { src } of this.live) {
      src.onended = null;
      try {
        src.stop();
      } catch {
        // not started yet or already stopped
      }
    }
    this.live = [];
    this.cues = [];
    cancelAnimationFrame(this.cueFrame);
    this.cueFrame = 0;
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
      this.schedule(clip, index, this.roles.get(index) ?? "step", this.only === null);
      if (this.only === null) {
        this.next = index + 1;
      } else {
        this.only = null;
        this.next = this.resumeAt ?? DONE;
        this.resumeAt = null;
      }
    }
    this.maybeIdle();
  }

  /** `inOrder`: part of the answer playing through (not a single piece played again). */
  private schedule(clip: Clip, index: number | null, role: SegmentRole | "clip", inOrder = false) {
    const ctx = this.ctx!;
    const when = Math.max(ctx.currentTime + 0.03, this.nextAt);
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
    const entry = { src, index, cue: index === null ? null : this.cue(index, when) };
    this.live.push(entry);
    src.onended = () => {
      this.live = this.live.filter((e) => e !== entry);
      // A piece that ended before it was lit (the page was in the background) is never lit afterwards.
      if (entry.cue) this.cues = this.cues.filter((c) => c !== entry.cue);
      // Only a piece that played to its end moves the answer on (stop() clears onended first).
      if (inOrder && index !== null) this.answerAt = Math.max(this.answerAt, index + 1);
      if (generation === this.generation) this.maybeIdle();
    };
    this.nextAt = end + PAUSE[role] / this.pace;
    debugLog({ index, role, when: +when.toFixed(3), duration: +clip.duration.toFixed(3), gain: +clip.gain.toFixed(2) });
  }

  /** Lights up piece `index` when the audio clock reaches `when`. The audio clock, not a timer:
   *  if the phone pauses the sound, the highlight waits with it. */
  private cue(index: number, when: number): Cue {
    const cue = { index, when };
    this.cues.push(cue);
    if (!this.cueFrame) this.cueFrame = requestAnimationFrame(this.tickCues);
    return cue;
  }

  private tickCues = () => {
    this.cueFrame = 0;
    const now = this.ctx?.currentTime ?? 0;
    while (this.cues.length && this.cues[0].when <= now + 0.02) {
      const { index } = this.cues.shift()!;
      this.listener.onStart?.(index);
    }
    if (this.cues.length) this.cueFrame = requestAnimationFrame(this.tickCues);
  };

  private maybeIdle() {
    if (!this.playing || this.live.length) return;
    const finished = this.next === DONE || (this.last !== null && this.next > this.last);
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
