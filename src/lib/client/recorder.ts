"use client";

// Records her question and stops by itself shortly after she stops talking.
// The noise floor is measured first, so a running exhaust fan doesn't count as speech.

export interface Recording {
  blob: Blob;
  filename: string;
  heardSpeech: boolean;
}

export interface Recorder {
  stop(): Promise<Recording>;
  cancel(): void;
}

const MAX_MS = 25_000; // Sarvam's REST limit is 30 s
const SILENCE_AFTER_SPEECH_MS = 1_500;
const GIVE_UP_WITHOUT_SPEECH_MS = 8_000;

function pickMime(): { mimeType: string; ext: string } {
  const options = [
    { mimeType: "audio/webm;codecs=opus", ext: "webm" },
    { mimeType: "audio/mp4", ext: "m4a" },
    { mimeType: "audio/ogg;codecs=opus", ext: "ogg" },
  ];
  return options.find((o) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(o.mimeType))
    ?? { mimeType: "", ext: "webm" };
}

export async function startRecording({ onLevel, onAutoStop }: {
  /** 0..1, about 20 times a second. */
  onLevel: (level: number) => void;
  /** Called when it stops by itself (silence or time limit). */
  onAutoStop: () => void;
}): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
  });
  const { mimeType, ext } = pickMime();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 32_000 } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);

  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const samples = new Float32Array(analyser.fftSize);

  const started = performance.now();
  let noiseFloor = 0.01;
  let calibrating = true;
  let heardSpeech = false;
  let lastVoice = started;
  let finished = false;

  const timer = setInterval(() => {
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const s of samples) sum += s * s;
    const rms = Math.sqrt(sum / samples.length);
    const now = performance.now();
    onLevel(Math.min(1, rms * 8));

    if (calibrating) {
      noiseFloor = Math.max(noiseFloor, rms);
      if (now - started > 350) calibrating = false;
      return;
    }
    if (rms > Math.max(noiseFloor * 2.2, 0.025)) {
      heardSpeech = true;
      lastVoice = now;
    }
    const quietFor = now - lastVoice;
    if ((heardSpeech && quietFor > SILENCE_AFTER_SPEECH_MS)
        || (!heardSpeech && now - started > GIVE_UP_WITHOUT_SPEECH_MS)
        || now - started > MAX_MS) {
      clearInterval(timer); // say it once; the app stops or cancels this recorder
      onAutoStop();
    }
  }, 50);

  const cleanup = () => {
    finished = true;
    clearInterval(timer);
    stream.getTracks().forEach((t) => t.stop());
    ctx.close().catch(() => {});
  };

  recorder.start(250);

  return {
    stop: () =>
      new Promise<Recording>((resolve) => {
        if (finished) return resolve({ blob: new Blob([], { type: mimeType }), filename: `question.${ext}`, heardSpeech: false });
        recorder.onstop = () => {
          cleanup();
          resolve({ blob: new Blob(chunks, { type: recorder.mimeType || mimeType }), filename: `question.${ext}`, heardSpeech });
        };
        recorder.stop();
      }),
    cancel: () => {
      if (finished) return;
      recorder.onstop = cleanup;
      recorder.stop();
    },
  };
}
