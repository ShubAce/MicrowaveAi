"use client";

// Plays the answer's spoken pieces in order as they arrive (they can arrive out of order),
// and reports loudness so the mascot's mouth can move with the voice.

type Listener = { onStart?: (index: number) => void; onIdle?: () => void };

export class Player {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private buffers = new Map<number, AudioBuffer>();
  private failed = new Set<number>();
  private next = 0;
  private last: number | null = null; // index of the final piece, once known
  private source: AudioBufferSourceNode | null = null;
  private clip: Promise<void> | null = null;
  private only: number | null = null; // replaying a single piece
  private paused = true; // nothing is queued to play until start/replay
  private generation = 0; // bumped on every stop, so stale "ended" callbacks do nothing
  private levels = new Float32Array(512);
  listener: Listener = {};

  /** Must run inside a tap, so phones allow sound later. */
  unlock() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    const s = this.ctx.createBufferSource();
    s.buffer = this.ctx.createBuffer(1, 1, 22050);
    s.connect(this.ctx.destination);
    s.start();
  }

  /** Forget the previous answer and start playing the new one as its pieces arrive. */
  start() {
    this.stop();
    this.buffers.clear();
    this.failed.clear();
    this.last = null;
    this.only = null;
    this.next = 0;
    this.paused = false;
  }

  async add(index: number, data: ArrayBuffer) {
    if (!this.ctx) return;
    try {
      this.buffers.set(index, await this.ctx.decodeAudioData(data));
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
    return this.buffers.has(index);
  }

  /** A short clip ("जी, देखती हूँ", a voice preview) that plays before any answer pieces. */
  playClip(source: string | ArrayBuffer) {
    if (!this.ctx) return;
    const gen = this.generation;
    const data = typeof source === "string" ? fetch(source).then((r) => r.arrayBuffer()) : Promise.resolve(source);
    this.clip = data
      .then((d) => this.ctx!.decodeAudioData(d))
      .then((buffer) => (gen === this.generation ? this.play(buffer) : undefined))
      .catch(() => {}) // a missing clip isn't worth interrupting anything for
      .finally(() => {
        this.clip = null;
        this.pump();
      });
  }

  replayAll() {
    this.stop();
    this.only = null;
    this.next = 0;
    this.paused = false;
    this.pump();
  }

  replay(index: number) {
    if (!this.buffers.has(index)) return;
    this.stop();
    this.only = index;
    this.next = index;
    this.paused = false;
    this.pump();
  }

  stop() {
    this.generation++;
    this.paused = true;
    const src = this.source;
    this.source = null;
    try {
      src?.stop();
    } catch {
      // already stopped
    }
  }

  get speaking() {
    return this.source !== null;
  }

  /** Current loudness 0..1. */
  level(): number {
    if (!this.analyser || !this.source) return 0;
    this.analyser.getFloatTimeDomainData(this.levels);
    let sum = 0;
    for (const v of this.levels) sum += v * v;
    return Math.min(1, Math.sqrt(sum / this.levels.length) * 5);
  }

  private play(buffer: AudioBuffer): Promise<void> {
    return new Promise((resolve) => {
      const src = this.ctx!.createBufferSource();
      src.buffer = buffer;
      src.connect(this.analyser!);
      src.onended = () => {
        if (this.source === src) this.source = null;
        resolve();
      };
      this.source = src;
      src.start();
    });
  }

  private pump() {
    if (this.paused || this.source || this.clip || !this.ctx) return;
    while (this.failed.has(this.next)) this.next++;
    if (this.last !== null && this.next > this.last) {
      this.paused = true;
      this.listener.onIdle?.();
      return;
    }
    const buffer = this.buffers.get(this.next);
    if (!buffer) return; // not arrived yet
    const index = this.next;
    const gen = this.generation;
    this.listener.onStart?.(index);
    this.play(buffer).then(() => {
      if (gen !== this.generation) return; // stopped or restarted meanwhile
      if (this.only === index) {
        this.only = null;
        this.paused = true;
        this.listener.onIdle?.();
        return;
      }
      this.next = index + 1;
      this.pump();
    });
  }
}
