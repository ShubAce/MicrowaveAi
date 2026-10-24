"use client";

import { useEffect, useRef } from "react";

export type Phase = "idle" | "listening" | "thinking" | "speaking" | "done" | "error";

const LABELS: Record<Phase, { label: string; hint?: string }> = {
  idle: { label: "बोलिए", hint: "बटन दबाकर अपना सवाल बोलिए" },
  done: { label: "और पूछिए", hint: "बटन दबाकर अगला सवाल बोलिए" },
  error: { label: "फिर से बोलिए" },
  listening: { label: "सुन रही हूँ…", hint: "बोलकर रुक जाइए" },
  thinking: { label: "सोच रही हूँ…" },
  speaking: { label: "रोकें", hint: "बोलना बंद करने के लिए दबाइए" },
};

export function MicButton({ phase, level, onPress, compact = false }: {
  phase: Phase;
  /** Microphone loudness 0..1 while listening. */
  level: () => number;
  onPress: () => void;
  compact?: boolean;
}) {
  const ring = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (phase !== "listening") return;
    let raf = 0;
    let shown = 0;
    const tick = () => {
      shown += (level() - shown) * 0.3;
      ring.current?.style.setProperty("transform", `scale(${1 + shown * 0.35})`);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, level]);

  const { label, hint } = LABELS[phase];
  const size = compact ? "size-[84px]" : "size-[136px]";
  const icon = compact ? "size-9" : "size-14";

  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={onPress}
        disabled={phase === "thinking"}
        aria-label={label}
        className={`relative grid ${size} place-items-center rounded-full bg-rani text-white shadow-[0_8px_0_var(--color-rani-deep),0_18px_30px_rgb(168_16_79/0.32)] transition-transform active:translate-y-[6px] active:shadow-[0_2px_0_var(--color-rani-deep),0_8px_16px_rgb(168_16_79/0.3)] disabled:cursor-wait`}
      >
        {phase === "listening" && (
          <span ref={ring} aria-hidden className="pointer-events-none absolute -inset-3 rounded-full border-[7px] border-genda transition-transform duration-75" />
        )}
        {phase === "thinking" ? (
          <span aria-hidden className="flex gap-2">
            {[0, 1, 2].map((i) => <span key={i} className="block size-3.5 rounded-full bg-white" style={{ animation: `dots 1.2s ${i * 0.2}s ease-in-out infinite` }} />)}
          </span>
        ) : phase === "speaking" || phase === "listening" ? (
          <span aria-hidden className={`block ${compact ? "size-7" : "size-11"} rounded-[22%] bg-white`} />
        ) : (
          <svg aria-hidden viewBox="0 0 24 24" className={icon} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="8.5" y="2.5" width="7" height="12" rx="3.5" fill="currentColor" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3.5M8.5 21.5h7" />
          </svg>
        )}
      </button>
      <p className={`${compact ? "mt-3 text-[19px]" : "mt-6 text-[28px]"} font-bold leading-tight`}>{label}</p>
      {hint && !compact && <p className="mt-1 text-[18px] text-baingan-soft">{hint}</p>}
    </div>
  );
}
