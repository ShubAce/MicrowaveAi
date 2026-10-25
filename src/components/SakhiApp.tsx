"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ask, LockedError, speakText } from "@/lib/client/ask";
import { Player } from "@/lib/client/player";
import { startRecording, type Recorder } from "@/lib/client/recorder";
import { settingsStore, type Settings } from "@/lib/client/settings";
import { CLIPS, clipUrl, FILLERS, type ClipName } from "@/lib/clips";
import { answerToHistory } from "@/lib/history";
import type { HistoryTurn } from "@/lib/protocol";
import { segmentsOf, speechFor, tileAudioUrl } from "@/lib/segments";
import { TILES, type Tile } from "@/lib/tiles";
import { DEFAULT_PACE, DEFAULT_VOICE } from "@/lib/voices";
import { AnswerView, EMPTY_ANSWER, type AnswerState } from "./AnswerView";
import { CardMarigolds, HeaderTrim, HeadingSprig, Rangoli, Toran } from "./Floral";
import { MasalaDabba } from "./MasalaDabba";
import { Mascot, type Mood } from "./Mascot";
import { MicButton, type Phase } from "./MicButton";
import { RecipeBook } from "./RecipeBook";
import { SettingsSheet } from "./SettingsSheet";

type Problem = "no-speech" | "mic" | "network" | "busy" | "no-voice" | "locked";
const PROBLEM_TEXT: Record<Problem, string> = {
  "no-speech": CLIPS["no-speech"],
  mic: CLIPS.mic,
  network: CLIPS.network,
  busy: CLIPS.busy,
  "no-voice": CLIPS["no-voice"],
  locked: "यह ऐप परिवार के लिए है। अपने परिवार से सही लिंक माँगिए।",
};
/** Some pieces of an answer could not be spoken (no voice left for them). */
const SOME_SILENT = "कुछ हिस्सों की आवाज़ नहीं आ पाई। वे स्क्रीन पर लिखे हैं, पढ़ लीजिए।";

const MOODS: Record<Phase, Mood> = {
  idle: "idle",
  listening: "listening",
  thinking: "thinking",
  speaking: "speaking",
  done: "happy",
  error: "oops",
};

const STATUS: Record<Phase, string> = {
  idle: "पूछिए",
  listening: "सुन रही हूँ…",
  thinking: "सोच रही हूँ…",
  speaking: "बता रही हूँ…",
  done: "और कुछ पूछना हो तो बोलिए",
  error: "ओह!",
};

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
}

const keepTurns = (h: HistoryTurn[]) => h.slice(-6);

/** Clips that must play even when the internet is down, so they are fetched ahead of time. */
const PROBLEM_CLIPS: ClipName[] = ["no-speech", "mic", "network", "busy", "no-voice"];

export function SakhiApp() {
  const settings = useSyncExternalStore(settingsStore.subscribe, settingsStore.get, settingsStore.getServer);
  const [phase, setPhase] = useState<Phase>("idle");
  const [screen, setScreen] = useState<"home" | "answer" | "book">("home");
  const [view, setView] = useState<AnswerState>(EMPTY_ANSWER);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);

  const player = useRef<Player | null>(null);
  const recorder = useRef<Recorder | null>(null);
  /** Bumped whenever she does something other than speak, so a recording (or a mic still opening) is dropped. */
  const listenId = useRef(0);
  const micOpening = useRef(false);
  const micLevel = useRef(0);
  const history = useRef<HistoryTurn[]>([]);
  const request = useRef<AbortController | null>(null);
  const answerDone = useRef(true);
  /** The notice last given for the answer on screen: replayed when none of the answer has sound. */
  const lastProblem = useRef<Problem | null>(null);
  const wake = useRef<WakeLockSentinel | null>(null);
  const wakeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const p = new Player();
    p.listener = {
      onStart: (index) => {
        setView((v) => ({ ...v, active: index }));
        setPhase("speaking");
      },
      onIdle: () => {
        setView((v) => ({ ...v, active: null }));
        setPhase((ph) => (ph === "error" ? ph : "done"));
      },
    };
    player.current = p;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      p.stop();
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("big-text", settings.bigText);
  }, [settings.bigText]);

  useEffect(() => {
    player.current?.setPace(settings.pace);
  }, [settings.pace]);

  /** Keep the screen on while she is following steps; let it sleep after 3 quiet minutes. */
  const keepAwake = useCallback(async () => {
    clearTimeout(wakeTimer.current);
    wakeTimer.current = setTimeout(() => wake.current?.release().catch(() => {}), 3 * 60_000);
    if (wake.current || !("wakeLock" in navigator)) return;
    try {
      wake.current = await navigator.wakeLock.request("screen");
      wake.current.addEventListener("release", () => (wake.current = null));
    } catch {
      // not allowed right now (e.g. battery saver); the screen just follows its normal timeout
    }
  }, []);

  /** Inside a tap: allow sound, and fetch the problem clips while the internet works. */
  const unlockAudio = useCallback(() => {
    const p = player.current!;
    p.unlock();
    p.preload([...PROBLEM_CLIPS, ...FILLERS].map((c) => clipUrl(settings.voice, c)));
  }, [settings.voice]);

  /** She did something other than speak: drop the recording, never send it. True if one was running. */
  const stopListening = useCallback(() => {
    listenId.current++;
    const r = recorder.current;
    if (!r) return false;
    recorder.current = null;
    r.cancel();
    return true;
  }, []);

  const problem = useCallback((kind: Problem) => {
    answerDone.current = true;
    lastProblem.current = kind;
    setView((v) => ({ ...v, error: PROBLEM_TEXT[kind], active: null }));
    setPhase("error");
    const p = player.current;
    if (p && kind !== "locked") {
      p.start();
      p.playClip(clipUrl(settings.voice, kind as ClipName));
    }
  }, [settings.voice]);

  const submit = useCallback(async (input: { audio?: { blob: Blob; filename: string }; text?: string }) => {
    stopListening();
    unlockAudio(); // a suggestion tap is a fresh tap: the phone may have paused the sound meanwhile
    request.current?.abort();
    const ctrl = new AbortController();
    request.current = ctrl;
    const p = player.current!;
    const audio = p.start();
    answerDone.current = false;
    lastProblem.current = null;
    setView({ ...EMPTY_ANSWER, question: input.text ?? null });
    setScreen("answer");
    setPhase("thinking");
    keepAwake();
    p.playClip(clipUrl(settings.voice, FILLERS[Math.floor(Math.random() * FILLERS.length)]));

    let pieces = 0;
    const voiced = new Set<number>(); // pieces whose speech (or speech error) has arrived
    let spoken = 0; // pieces with speech she can hear
    let silent = 0; // pieces no voice could speak (Sarvam and Gemini both out)
    let question = input.text ?? "";
    /** The answer was cut off after some of it arrived: keep what came, and say so. */
    const keepPartial = () => {
      answerDone.current = true;
      for (let i = 0; i < pieces; i++) if (!voiced.has(i)) audio.skip(i); // their speech will not come now
      audio.setCount(pieces);
      setView((v) => ({ ...v, error: "जवाब पूरा नहीं आ पाया। ज़रूरत हो तो फिर से पूछिए।" }));
    };
    try {
      await ask({
        ...input,
        history: history.current,
        settings,
        signal: ctrl.signal,
        onEvent: (e) => {
          if (ctrl.signal.aborted) return;
          switch (e.type) {
            case "transcript":
              question = e.text;
              setView((v) => ({ ...v, question: e.text }));
              break;
            case "meta":
              setView((v) => ({ ...v, title: e.title }));
              break;
            case "segment":
              pieces++;
              audio.setRole(e.segment.index, e.segment.role);
              setView((v) => ({ ...v, segments: [...v.segments, e.segment] }));
              break;
            case "audio":
              voiced.add(e.index);
              spoken++;
              audio.addBase64(e.index, e.b64);
              break;
            case "audio_error":
              voiced.add(e.index);
              silent++;
              audio.skip(e.index);
              break;
            case "done":
              answerDone.current = true;
              history.current = keepTurns([...history.current, { role: "user", text: question }, answerToHistory(e.answer)]);
              setView((v) => ({ ...v, answer: e.answer, title: v.title ?? e.answer.title }));
              audio.setCount(pieces);
              // All speech has arrived by now. With none at all, say so in a ready-made clip.
              if (pieces && silent === pieces) problem("no-voice");
              else if (silent) setView((v) => ({ ...v, error: SOME_SILENT }));
              break;
            case "error":
              // Cut off: keep what she has heard; with nothing heard, say so in a ready-made clip.
              if (spoken) keepPartial();
              else problem(e.code === "no_speech" ? "no-speech" : "busy");
              break;
          }
        },
      });
      // The stream ended without saying it was done: finish with what arrived.
      if (!ctrl.signal.aborted && !answerDone.current) {
        if (!spoken) return problem("busy");
        keepPartial();
      }
    } catch (err) {
      if (ctrl.signal.aborted || answerDone.current) return;
      if (spoken && !(err instanceof LockedError)) return keepPartial();
      problem(err instanceof LockedError ? "locked" : navigator.onLine ? "busy" : "network");
    }
  }, [settings, keepAwake, problem, unlockAudio, stopListening]);

  const finishRecording = useCallback(async () => {
    const r = recorder.current;
    if (!r) return;
    recorder.current = null;
    const id = listenId.current;
    const rec = await r.stop();
    if (id !== listenId.current) return; // she tapped something else meanwhile
    if (!rec.heardSpeech || rec.blob.size < 1500) {
      setView(EMPTY_ANSWER);
      setScreen("answer");
      problem("no-speech");
      return;
    }
    submit({ audio: rec });
  }, [submit, problem]);

  const onMic = useCallback(async () => {
    const p = player.current!;
    if (phase === "listening") return finishRecording();
    if (phase === "speaking") {
      p.halt();
      setView((v) => ({ ...v, active: null }));
      setPhase("done");
      return;
    }
    if (phase === "thinking" || micOpening.current) return; // a second tap while the mic opens does nothing
    unlockAudio();
    p.stop();
    keepAwake();
    const id = ++listenId.current;
    micOpening.current = true;
    try {
      let me: Recorder | null = null;
      me = await startRecording({
        onLevel: (l) => (micLevel.current = l),
        // Only the current recording may finish; a stray one just closes itself.
        onAutoStop: () => (recorder.current === me ? void finishRecording() : me?.cancel()),
      });
      if (id !== listenId.current) return me.cancel(); // she tapped something else while the mic opened
      recorder.current = me;
      setPhase("listening");
    } catch {
      if (id !== listenId.current) return;
      setScreen("answer");
      setView(EMPTY_ANSWER);
      problem("mic");
    } finally {
      micOpening.current = false;
    }
  }, [phase, finishRecording, keepAwake, problem, unlockAudio]);

  const openTile = useCallback((tile: Tile) => {
    request.current?.abort();
    const ctrl = new AbortController();
    request.current = ctrl;
    stopListening();
    const p = player.current!;
    unlockAudio();
    const audio = p.start();
    keepAwake();
    const segments = segmentsOf(tile.answer);
    answerDone.current = true;
    lastProblem.current = null;
    setView({ ...EMPTY_ANSWER, question: tile.question, title: tile.answer.title, segments, answer: tile.answer });
    setScreen("answer");
    setPhase("thinking");
    history.current = keepTurns([...history.current, { role: "user", text: tile.question }, answerToHistory(tile.answer)]);
    audio.setCount(segments.length);
    let failures = 0;
    let settled = 0;
    const settle = () => {
      if (++settled < segments.length || ctrl.signal.aborted) return;
      if (failures === segments.length) problem(navigator.onLine ? "no-voice" : "network");
      else if (failures) setView((v) => ({ ...v, error: SOME_SILENT }));
    };
    for (const s of segments) {
      audio.setRole(s.index, s.role);
      // Ready-made audio exists for the default voice at the normal speed. Anything else is spoken on
      // demand (by Sarvam), and when that fails the ready-made audio still plays, in the default voice.
      const recording = () => fetch(tileAudioUrl(DEFAULT_VOICE, tile.id, s.index), { signal: ctrl.signal })
        .then((r) => (r.ok && r.headers.get("content-type")?.startsWith("audio") ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))));
      const speak = () => speakText(speechFor(tile.answer, s), settings, ctrl.signal);
      const ready = settings.pace === DEFAULT_PACE && settings.voice === DEFAULT_VOICE
        ? recording().catch(speak)
        : speak().catch(recording);
      ready
        .then((data) => audio.add(s.index, data))
        .catch(() => {
          failures++;
          audio.skip(s.index);
        })
        .finally(settle);
    }
  }, [settings, keepAwake, problem, unlockAudio, stopListening]);

  const goHome = () => {
    request.current?.abort();
    stopListening();
    player.current?.stop();
    history.current = [];
    setView(EMPTY_ANSWER);
    setPhase("idle");
    setScreen("home");
  };

  /** None of the answer on screen has sound: say the notice that was given for it again. */
  const repeatProblem = () => {
    const p = player.current;
    const kind = lastProblem.current;
    if (!p || !kind || kind === "locked" || view.segments.some((s) => p.has(s.index))) return false;
    p.unlock();
    p.playClip(clipUrl(settings.voice, kind as ClipName), true);
    return true;
  };

  const replay = (index: number) => {
    if (stopListening()) setPhase("done");
    const p = player.current;
    if (!p?.has(index)) return void repeatProblem();
    p.unlock();
    p.replay(index);
  };

  const replayAll = () => {
    if (stopListening()) setPhase("done");
    const p = player.current;
    if (!p || repeatProblem()) return;
    p.unlock();
    p.replayAll();
  };

  const openBook = () => {
    if (stopListening()) setPhase("idle");
    setScreen("book");
  };

  const openSettings = () => {
    if (stopListening()) setPhase("idle");
    setSheetOpen(true);
  };

  const preview = (voice: Settings["voice"]) => {
    const p = player.current;
    if (!p) return;
    p.unlock();
    // The preview replaces whatever was being said or prepared.
    if (phase === "speaking" || phase === "thinking" || phase === "listening") {
      request.current?.abort();
      stopListening();
      answerDone.current = true;
      setView((v) => ({ ...v, active: null }));
      setPhase("done");
    }
    // When Sarvam can't speak, the voice's own ready-made line still lets her hear it.
    const fallback = () => fetch(clipUrl(voice, "filler-3")).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))));
    p.playClip(speakText("नमस्ते! मैं सखी हूँ। बताइए, आज क्या बनाना है?", { voice, pace: settings.pace }).catch(fallback), true);
  };

  const micLevelNow = useCallback(() => micLevel.current, []);
  const voiceLevel = useCallback(() => player.current?.level() ?? 0, []);
  const mood = MOODS[phase];

  return (
    <div className="mx-auto min-h-dvh w-full max-w-130">
      {screen === "home" ? (
        <main className="relative flex min-h-dvh flex-col px-4 pb-10 pt-7">
          <Toran />
          <header className="relative z-10 flex items-center justify-between">
            <p className="text-[1.625rem] font-bold">नमस्ते {settings.name} 🙏</p>
            <button
              type="button"
              onClick={openSettings}
              aria-label="सेटिंग"
              className="grid size-12 place-items-center rounded-full bg-white/70 text-baingan-soft shadow-[0_0_0_2px_var(--color-pista-line)]"
            >
              <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
          </header>

          <section className="mt-3 flex flex-col items-center">
            <Mascot mood={mood} level={voiceLevel} size={210} />
            <div className="relative mt-3 w-full rounded-[26px] bg-white px-5 py-4 text-center shadow-[0_0_0_2px_var(--color-pista-line)]">
              <span aria-hidden className="absolute -top-2.5 left-1/2 size-5 -translate-x-1/2 rotate-45 bg-white shadow-[-2px_-2px_0_0_var(--color-pista-line)]" />
              {phase === "listening" ? (
                <p className="text-[1.4375rem] font-bold text-rani">सुन रही हूँ… बोलिए</p>
              ) : (
                <>
                  <p className="text-[1.4375rem] font-bold leading-snug">मैं सखी हूँ। माइक्रोवेव के बारे में कुछ भी पूछिए।</p>
                  <p className="mt-1 text-[1.1875rem] text-baingan-soft">जैसे: “पनीर टिक्का कैसे बनाऊँ?”</p>
                </>
              )}
            </div>
          </section>

          <section className="mt-9">
            <MicButton phase={phase} level={micLevelNow} onPress={onMic} />
          </section>

          <section className="mt-12">
            <div className="mb-5 flex items-center justify-center gap-3">
              <HeadingSprig side="left" />
              <h2 className="shrink-0 text-center text-[1.375rem] font-bold">या यहाँ से चुनिए</h2>
              <HeadingSprig side="right" />
            </div>
            <MasalaDabba tiles={TILES} onPick={openTile} />
          </section>

          <button
            type="button"
            onClick={openBook}
            className="relative mt-10 flex items-center gap-4 rounded-3xl bg-white px-5 py-4 text-left shadow-[0_0_0_2px_var(--color-pista-line),0_6px_0_var(--color-pista-line)] active:translate-y-1 active:shadow-[0_0_0_2px_var(--color-pista-line)]"
          >
            <CardMarigolds />
            <span aria-hidden className="grid size-16 shrink-0 place-items-center rounded-full bg-genda-soft text-[2.125rem]">📖</span>
            <span>
              <span className="block text-[1.4375rem] font-extrabold leading-tight">रेसिपी किताब</span>
              <span className="block text-[1.0625rem] leading-snug text-baingan-soft">331 चीज़ें, जो आपका माइक्रोवेव अपने-आप बनाता है</span>
            </span>
          </button>
          <Rangoli />
        </main>
      ) : screen === "book" ? (
        <RecipeBook
          onBack={() => setScreen("home")}
          onAsk={(question) => {
            player.current?.unlock();
            submit({ text: question });
          }}
        />
      ) : (
        <main className="flex min-h-dvh flex-col">
          <header data-bar="top" className="sticky top-0 z-10 flex items-center gap-2 bg-pista/95 px-3 py-2 backdrop-blur">
            <button
              type="button"
              onClick={goHome}
              aria-label="शुरू पर जाएँ"
              className="grid size-12 shrink-0 place-items-center rounded-full bg-white shadow-[0_0_0_2px_var(--color-pista-line)]"
            >
              <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M15 5l-7 7 7 7" />
              </svg>
            </button>
            <Mascot mood={mood} level={voiceLevel} size={76} />
            <p aria-live="polite" className="text-[1.25rem] font-bold leading-tight">{STATUS[phase]}</p>
            <HeaderTrim />
          </header>

          <div className="flex-1 px-4 pb-57.5 pt-3">
            <AnswerView state={view} onReplay={replay} onSuggestion={(t) => submit({ text: t })} />
          </div>

          <footer data-bar="bottom" className="fl-zari fixed inset-x-0 bottom-0 z-20 mx-auto max-w-130 rounded-t-[30px] bg-white px-3 pb-[max(14px,env(safe-area-inset-bottom))] pt-4 shadow-[0_-10px_28px_rgb(58_31_61/0.13)]">
            <div className="grid grid-cols-3 items-start">
              <button
                type="button"
                onClick={replayAll}
                disabled={!view.segments.length}
                className="flex flex-col items-center gap-1.5 pt-3 text-[1.0625rem] font-bold disabled:opacity-40"
              >
                <span className="grid size-14 place-items-center rounded-full bg-genda-soft">
                  <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M4 12a8 8 0 1 0 2.5-5.8M4 4v4.5h4.5" />
                  </svg>
                </span>
                फिर से सुनाइए
              </button>
              <MicButton phase={phase} level={micLevelNow} onPress={onMic} compact />
              <button type="button" onClick={goHome} className="flex flex-col items-center gap-1.5 pt-3 text-[1.0625rem] font-bold">
                <span className="grid size-14 place-items-center rounded-full bg-pista">
                  <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M4 11l8-7 8 7M6.5 9.5V20h11V9.5" />
                  </svg>
                </span>
                शुरू पर
              </button>
            </div>
          </footer>
        </main>
      )}

      <SettingsSheet
        open={sheetOpen}
        settings={settings}
        onChange={settingsStore.set}
        onClose={() => setSheetOpen(false)}
        onPreview={preview}
        installPrompt={installPrompt}
      />
    </div>
  );
}
