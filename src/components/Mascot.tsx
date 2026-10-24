"use client";

import { useEffect, useRef } from "react";

export type Mood = "idle" | "listening" | "thinking" | "speaking" | "happy" | "oops";

// सखी: her own microwave (black glass, the gold leaf art from the real door, a glowing LED face).
export function Mascot({ mood, level, size = 220 }: {
  mood: Mood;
  /** Returns the current voice loudness 0..1; drives the mouth while speaking. */
  level?: () => number;
  size?: number;
}) {
  const mouth = useRef<SVGEllipseElement>(null);

  useEffect(() => {
    if (mood !== "speaking" || !level) return;
    let raf = 0;
    let open = 0;
    const tick = () => {
      open += (level() - open) * 0.35; // smooth it so the mouth doesn't flicker
      mouth.current?.setAttribute("ry", String(2.5 + open * 9));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mood, level]);

  const look =
    mood === "thinking" ? "translate(4px,-5px) scaleY(0.75)"
    : mood === "listening" ? "scale(1.12)"
    : mood === "oops" ? "scaleY(0.6)"
    : "none";
  const happyEyes = mood === "happy";

  return (
    <svg
      viewBox="0 0 220 196"
      width={size}
      height={(size * 196) / 220}
      role="img"
      aria-label="सखी, आपकी माइक्रोवेव सहेली"
      className="overflow-visible"
    >
      <defs>
        <linearGradient id="m-glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2c2934" />
          <stop offset="1" stopColor="#121016" />
        </linearGradient>
        <radialGradient id="m-window" cx="0.55" cy="0.4" r="0.8">
          <stop offset="0" stopColor="#25222d" />
          <stop offset="1" stopColor="#17151c" />
        </radialGradient>
        <filter id="m-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="2.6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <ellipse className="mascot-shadow" cx="110" cy="184" rx="72" ry="7" fill="#3a1f3d" opacity="0.16" />

      {mood === "listening" && (
        <g className="mascot-wave" fill="none" stroke="#d6246e" strokeWidth="4" strokeLinecap="round">
          <path d="M8 70 Q-4 96 8 122" />
          <path d="M-4 60 Q-20 96 -4 132" />
          <path d="M212 70 Q224 96 212 122" />
          <path d="M224 60 Q240 96 224 132" />
        </g>
      )}

      <g className="mascot-body">
        {mood === "thinking" && (
          <g className="mascot-steam" fill="#ffffff" opacity="0.9">
            <circle cx="92" cy="14" r="6" />
            <circle cx="108" cy="6" r="7.5" />
            <circle cx="124" cy="14" r="5.5" />
          </g>
        )}

        {/* feet */}
        <rect x="42" y="160" width="28" height="14" rx="7" fill="#0f0e13" />
        <rect x="150" y="160" width="28" height="14" rx="7" fill="#0f0e13" />

        {/* body and glass shine */}
        <rect x="12" y="26" width="196" height="142" rx="32" fill="url(#m-glass)" />
        <rect x="24" y="32" width="172" height="22" rx="11" fill="#ffffff" opacity="0.06" />

        {/* door window */}
        <rect x="26" y="42" width="128" height="112" rx="22" fill="url(#m-window)" />

        {/* gold leaf line art, like the real door */}
        <g fill="none" stroke="#c8a25c" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" opacity="0.9">
          <path d="M36 150 C 48 132, 52 116, 66 96" />
          <path d="M46 132 C 32 126, 30 110, 36 100 C 46 106, 50 118, 46 132 Z" />
          <path d="M57 112 C 47 100, 49 88, 57 80 C 65 88, 66 101, 57 112 Z" />
          <path d="M54 128 C 66 122, 78 126, 84 136 C 72 141, 61 137, 54 128 Z" />
          <path d="M40 116 L 45 126 M 56 92 L 57 104 M 62 130 L 74 133" strokeWidth="1.4" opacity="0.7" />
        </g>

        {/* cheeks */}
        <ellipse cx="80" cy="112" rx="8.5" ry="5.5" fill="#ff8fb8" opacity="0.72" />
        <ellipse cx="138" cy="112" rx="8.5" ry="5.5" fill="#ff8fb8" opacity="0.72" />

        {/* eyes */}
        {happyEyes ? (
          <g filter="url(#m-glow)" fill="none" stroke="#b7b4ff" strokeWidth="4.5" strokeLinecap="round">
            <path d="M83 90 Q91 79 99 90" />
            <path d="M119 90 Q127 79 135 90" />
          </g>
        ) : (
          <g className="mascot-eye" style={{ transform: look }}>
            <g className={mood === "idle" || mood === "speaking" ? "mascot-blink" : undefined}>
              <g filter="url(#m-glow)" fill="#b7b4ff">
                <rect x="83" y="74" width="16" height="23" rx="8" />
                <rect x="119" y="74" width="16" height="23" rx="8" />
              </g>
              <g fill="#ffffff" opacity="0.85">
                <circle cx="88" cy="80" r="2.4" />
                <circle cx="124" cy="80" r="2.4" />
              </g>
            </g>
          </g>
        )}

        {/* mouth */}
        <g filter="url(#m-glow)">
          {mood === "speaking" ? (
            <ellipse ref={mouth} cx="109" cy="117" rx="7" ry="3" fill="#b7b4ff" />
          ) : mood === "thinking" ? (
            <circle cx="112" cy="117" r="3.5" fill="#b7b4ff" />
          ) : mood === "oops" ? (
            <path d="M98 119 Q103 114 109 119 Q115 124 120 119" fill="none" stroke="#b7b4ff" strokeWidth="3.5" strokeLinecap="round" />
          ) : (
            <path
              d={mood === "happy" ? "M95 111 Q109 128 123 111" : "M99 112 Q109 121 119 112"}
              fill="none"
              stroke="#b7b4ff"
              strokeWidth="3.8"
              strokeLinecap="round"
            />
          )}
        </g>

        {mood === "oops" && <path d="M146 58 C 146 58, 140 67, 140 71 A 6 6 0 0 0 152 71 C 152 67, 146 58, 146 58 Z" fill="#8fd3ff" />}

        {/* the control strip: mini display, buttons, gold-rimmed dial, STOP and START */}
        <rect x="163" y="46" width="34" height="18" rx="5" fill="#0b0a0e" />
        {mood === "thinking" ? (
          <g className="mascot-dots" fill="#b7b4ff" filter="url(#m-glow)">
            <rect x="169" y="53" width="5" height="4" rx="1" />
            <rect x="177.5" y="53" width="5" height="4" rx="1" />
            <rect x="186" y="53" width="5" height="4" rx="1" />
          </g>
        ) : (
          <path
            d="M180 60 C 170 53, 172 47, 176.5 48.5 C 178.5 49.2, 180 51, 180 51 C 180 51, 181.5 49.2, 183.5 48.5 C 188 47, 190 53, 180 60 Z"
            fill="#b7b4ff"
            filter="url(#m-glow)"
          />
        )}
        <g fill="#6c6977">
          {[168, 180, 192].map((x) => (
            <g key={x}>
              <circle cx={x} cy="76" r="2.4" />
              <circle cx={x} cy="88" r="2.4" />
            </g>
          ))}
        </g>
        <circle cx="180" cy="113" r="12" fill="#26232d" stroke="#c8a25c" strokeWidth="2.6" />
        <circle cx="180" cy="113" r="6.5" fill="#1a1820" />
        <rect x="165" y="136" width="13" height="3" rx="1.5" fill="#e5484d" />
        <rect x="182" y="136" width="13" height="3" rx="1.5" fill="#e7e6ea" />
      </g>
    </svg>
  );
}
