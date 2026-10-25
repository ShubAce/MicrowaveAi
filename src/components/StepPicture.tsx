"use client";

import { useId, type CSSProperties, type ReactNode } from "react";
import { BUTTONS, type ButtonId } from "@/lib/buttons";
import { describeStep, type Accessory, type Action, type BeepAction, type DialFor, type PressHow, type Readout, type StepScene } from "@/lib/steps";
import { Mascot } from "./Mascot";
import { ButtonChip } from "./PanelBits";

// A small picture for one step, so she can see what to do on her microwave: the part of the panel to
// press, what the display will show, what goes inside, or what to do at the beep. Only the step being
// spoken moves.

export function StepPicture({ markup, active }: { markup: string; active: boolean }) {
  const scene = describeStep(markup);
  if (!scene) return null;
  return (
    <div aria-hidden className={`step-pic mt-3 rounded-[18px] bg-[#f5f9ee] p-3 shadow-[inset_0_0_0_2px_#e1edd2] ${active ? "is-active" : ""}`}>
      <Scene scene={scene} />
    </div>
  );
}

function Scene({ scene }: { scene: StepScene }) {
  switch (scene.kind) {
    case "panel": {
      // A long list or a double readout gets the full width; one press sits beside its readout.
      const stacked = scene.actions.length > 1 || (scene.readout?.values.length ?? 0) > 1;
      return (
        <div className="flex flex-col gap-2.5">
          <PanelZoom actions={scene.actions} />
          <div className={stacked ? "flex flex-col gap-2" : "flex items-start gap-2"}>
            {scene.readout && <ReadoutBox readout={scene.readout} narrow={!stacked} />}
            <ActionList actions={scene.actions} />
          </div>
        </div>
      );
    }
    case "place":
      return (
        <div className="flex items-center gap-3">
          <Oven accessory={scene.accessory} />
          <Caption title="अंदर रखिए" chip={scene.accessory ? ACCESSORY_NAME[scene.accessory] : undefined} />
        </div>
      );
    case "takeout":
      return (
        <div className="flex items-center gap-3">
          <Oven accessory={null} out />
          <Caption title="बाहर निकालिए" note={scene.gloves ? "दस्ताने पहनकर" : undefined} />
        </div>
      );
    case "arrange":
      return (
        <IconScene
          icon={<CounterIcon accessory={scene.accessory} />}
          title={scene.accessory === "tawa" ? "तवे पर रखिए" : "एयर फ्राई ट्रे पर फैलाइए"}
        />
      );
    case "pour":
      return <IconScene icon={<PourIcon />} title="बर्तन में डालिए" chip={scene.accessory ? ACCESSORY_NAME[scene.accessory] : undefined} />;
    case "beep":
      return <Beep action={scene.action} accessory={scene.accessory ?? null} minutes={scene.minutes} then={scene.then} />;
    case "stir":
      return <IconScene icon={<StirIcon />} title="चलाइए" note={scene.outsideIn ? "बाहर से अंदर की ओर" : undefined} />;
    case "flip":
      return <IconScene icon={<FlipIcon />} title="पलटिए" />;
    case "wait":
      return <IconScene icon={<ClockIcon />} title={scene.minutes ? `${scene.minutes} मिनट रुकिए` : "थोड़ा रुकिए"} />;
    case "display":
      return (
        <div className="flex items-center gap-3">
          <span className="text-[2.125rem] leading-none">👀</span>
          <div className="flex-1"><ReadoutBox readout={scene.readout} big /></div>
        </div>
      );
    case "ready":
      return (
        <div className="flex items-center gap-2">
          <Mascot mood="happy" size={92} still />
          <span className="pic-pop rounded-2xl rounded-bl-md bg-rani px-4 py-2 text-[1.25rem] font-bold text-white">तैयार!</span>
        </div>
      );
  }
}

// ---------------------------------------------------------------- the panel, zoomed to the buttons used

/** Where each button sits on the real panel (photo of MJEN286UGWF), in a 200-wide drawing. */
const SPOT: Record<ButtonId, { x: number; y: number; w: number; h: number; lines: string[] }> = {
  COOK_MODE: { x: 40, y: 116, w: 60, h: 52, lines: ["Cook", "Mode"] },
  CHARCOAL: { x: 100, y: 116, w: 60, h: 52, lines: ["Charcoal/", "Indian", "Cuisine"] },
  HEALTHY_HEART: { x: 160, y: 116, w: 60, h: 52, lines: ["Healthy", "Heart"] },
  ROTI_GHEE: { x: 40, y: 172, w: 60, h: 52, lines: ["Indian Roti", "Basket/", "Ghee"] },
  AIR_FRY: { x: 100, y: 172, w: 60, h: 52, lines: ["Air Fry/", "Low", "Calorie"] },
  KIDS_DAIRY: { x: 160, y: 172, w: 60, h: 52, lines: ["Kids'/", "Dairy", "Delight"] },
  DIAL: { x: 100, y: 246, w: 76, h: 76, lines: [] },
  STOP: { x: 60, y: 312, w: 68, h: 54, lines: ["Cancel"] },
  START: { x: 140, y: 312, w: 68, h: 54, lines: ["Select/", "+30 sec"] },
};

/** Horizontal slices of the panel, with room for the number badges. A close-up shows whole slices
 *  across the full width, so every label in it is complete and she sees the button's neighbours. */
const SLICE: Record<ButtonId, [number, number]> = {
  COOK_MODE: [68, 162], CHARCOAL: [68, 162], HEALTHY_HEART: [68, 162],
  ROTI_GHEE: [124, 218], AIR_FRY: [124, 218], KIDS_DAIRY: [124, 218],
  DIAL: [198, 294],
  STOP: [262, 362], START: [262, 362],
};

const fontFor = (line: string) => (line.length >= 10 ? 10.5 : 12.5);
/** Wide enough for the bold label of a pressed button. */
const ringWidth = (id: ButtonId) => Math.max(SPOT[id].w, ...SPOT[id].lines.map((l) => l.length * fontFor(l) * 0.56 + 10));

/** The slices of the pressed buttons, merged where they touch: a row button and STOP make two small
 *  close-ups instead of the whole panel, shown in the order she presses them. */
function stripsFor(order: ButtonId[]) {
  const spans = [...new Set(order)].map((id) => [...SLICE[id]] as [number, number]).sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1]);
    else merged.push(span);
  }
  const first = ([y0, y1]: [number, number]) => order.findIndex((id) => SPOT[id].y >= y0 && SPOT[id].y <= y1);
  return merged.sort((a, b) => first(a) - first(b)).map(([y0, y1]) => ({ y: y0, h: y1 - y0 }));
}

const STRONGER: PressHow[] = ["tap", "repeat", "hold"];

function PanelZoom({ actions }: { actions: Action[] }) {
  // Each pressed button once, with every step number it has ("2,3" for START pressed twice).
  const marks = new Map<ButtonId, { numbers: number[]; how: PressHow; seconds?: number }>();
  actions.forEach((a, i) => {
    if (a.kind !== "press") return;
    const m = marks.get(a.id);
    if (!m) marks.set(a.id, { numbers: [i + 1], how: a.how, seconds: a.seconds });
    else {
      m.numbers.push(i + 1);
      if (STRONGER.indexOf(a.how) > STRONGER.indexOf(m.how)) m.how = a.how;
      m.seconds = Math.max(m.seconds ?? 0, a.seconds ?? 0) || undefined;
    }
  });
  const numbered = actions.length > 1;
  return (
    <div className="flex flex-col gap-1.5">
      {stripsFor([...marks.keys()]).map((crop) => {
        // Only buttons that fit completely are drawn, so nothing is cut in half at the edges.
        const fits = (id: ButtonId) => SPOT[id].y - SPOT[id].h / 2 >= crop.y && SPOT[id].y + SPOT[id].h / 2 <= crop.y + crop.h;
        const shown = (Object.keys(SPOT) as ButtonId[]).filter(fits);
        const pressed = shown.filter((id) => marks.has(id));
        return (
          <div key={crop.y} className="overflow-hidden rounded-2xl bg-glass shadow-[0_3px_0_#0b0a0e]">
            <svg viewBox={`0 ${crop.y} 200 ${crop.h}`} className="mx-auto block w-full max-w-75">
              <rect x="0" y="0" width="200" height="370" fill="#17151c" />
              {/* rings first, so the pressed button's label stays readable on top */}
              {pressed.map((id) => {
                const s = SPOT[id];
                const w = ringWidth(id);
                return (
                  <g key={id} className="pic-pulse">
                    {id === "DIAL"
                      ? <circle cx={s.x} cy={s.y} r="36" fill="#d6246e" fillOpacity="0.2" stroke="#ff5c9a" strokeWidth="3.5" />
                      : <rect x={s.x - w / 2} y={s.y - s.h / 2} width={w} height={s.h} rx="13" fill="#d6246e" fillOpacity="0.2" stroke="#ff5c9a" strokeWidth="3.5" />}
                  </g>
                );
              })}
              {shown.map((id) => <ButtonLabel key={id} id={id} on={marks.has(id)} />)}
              {pressed.map((id) => {
                const s = SPOT[id];
                const m = marks.get(id)!;
                const w = ringWidth(id);
                const label = m.numbers.join(",");
                const bw = 10 + label.length * 7.5;
                // Badges go where nothing is printed: outside the ring's top-right corner (kept inside
                // the drawing), and for the dial on its left, outside the turning arrows and below "−".
                const bx = id === "DIAL" ? s.x - 58 : Math.min(s.x + w / 2 + 2, 200 - bw / 2 - 1);
                const by = id === "DIAL" ? s.y : s.y - s.h / 2 - 4;
                return (
                  <g key={id}>
                    {m.how === "hold" && <HoldRing x={s.x} y={s.y} r={Math.max(w, s.h) / 2 + 7} seconds={m.seconds ?? 3} />}
                    {m.how === "turn" && (
                      <g className="pic-spin">
                        <path d="M100 205 A41 41 0 0 1 141 246" fill="none" stroke="#ffb020" strokeWidth="4.5" strokeLinecap="round" />
                        <path d="M136 236 L141 248 L148 237" fill="none" stroke="#ffb020" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M100 287 A41 41 0 0 1 59 246" fill="none" stroke="#ffb020" strokeWidth="4.5" strokeLinecap="round" />
                        <path d="M64 256 L59 244 L52 255" fill="none" stroke="#ffb020" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
                      </g>
                    )}
                    {numbered && (
                      <g>
                        <rect x={bx - bw / 2} y={by - 10} width={bw} height="20" rx="10" fill="#ffb020" stroke="#17151c" strokeWidth="2.2" />
                        <text x={bx} y={by + 5} textAnchor="middle" fontSize="13" fontWeight="800" fill="#3a1f3d">{label}</text>
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        );
      })}
    </div>
  );
}

function ButtonLabel({ id, on }: { id: ButtonId; on: boolean }) {
  const s = SPOT[id];
  if (id === "DIAL") {
    return (
      <g>
        <text x="58" y="218" fill="#d9d8df" fontSize="16">−</text>
        <text x="134" y="218" fill="#d9d8df" fontSize="16">+</text>
        <circle cx="100" cy="246" r="27" fill="#1c1a22" stroke="#c8a25c" strokeWidth="4.5" />
        <circle cx="100" cy="246" r="15" fill="#26232d" />
      </g>
    );
  }
  if (id === "STOP" || id === "START") {
    return (
      <g>
        <text x={s.x} y={s.y - 8} textAnchor="middle" fontSize="15" fontWeight="700" fill={id === "STOP" ? "#ff5c5c" : "#f1f0f4"}>
          {id === "STOP" ? "STOP" : "◇START"}
        </text>
        <rect x={s.x - 22} y={s.y - 3} width="44" height="2.5" rx="1" fill={id === "STOP" ? "#e5484d" : "#f1f0f4"} />
        {s.lines.map((l, i) => (
          <text key={l} x={s.x} y={s.y + 11 + i * 11} textAnchor="middle" fontSize="10" fill="#bdbbc6">{l}</text>
        ))}
      </g>
    );
  }
  return (
    <g>
      {s.lines.map((l, i) => (
        <text key={l} x={s.x} y={s.y - (s.lines.length - 1) * 7 + i * 14 + 5} textAnchor="middle"
          fontSize={fontFor(l)} fontWeight={on ? 800 : 500} fill={on ? "#ffffff" : "#a9a7b3"}>
          {l}
        </text>
      ))}
    </g>
  );
}

/** A ring that fills up over the hold's seconds while the step is spoken. */
function HoldRing({ x, y, r, seconds }: { x: number; y: number; r: number; seconds: number }) {
  const c = Math.round(2 * Math.PI * r);
  return (
    <circle className="pic-ring" cx={x} cy={y} r={r} fill="none" stroke="#ffb020" strokeWidth="4"
      strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * 0.2}
      transform={`rotate(-90 ${x} ${y})`} style={{ "--ring": c, animationDuration: `${seconds}s` } as CSSProperties} />
  );
}

const PRESS_WORDS: Record<Exclude<PressHow, "turn" | "hold">, string> = {
  tap: "दबाइए",
  repeat: "बार-बार दबाइए",
};
const DIAL_WORDS: Record<Exclude<DialFor, null>, string> = {
  code: "घुमाकर कोड लाइए",
  weight: "घुमाकर वज़न चुनिए",
  time: "घुमाकर समय चुनिए",
  temperature: "घुमाकर तापमान चुनिए",
  power: "घुमाकर पावर चुनिए",
};
const PRESS_ICON: Record<PressHow, string> = { tap: "👆", repeat: "🔁", hold: "⏱️", turn: "🔄" };

function actionWords(a: Action): string {
  switch (a.kind) {
    case "press": {
      const b = BUTTONS[a.id].hint;
      if (a.how === "turn") return `${b} ${a.dialFor ? DIAL_WORDS[a.dialFor] : "घुमाइए"}`;
      if (a.how === "hold") return `${b} ${a.seconds ?? 3} सेकंड दबाए रखिए`;
      if (a.how === "repeat" && a.times) return `${b} ${a.times} बार दबाइए`;
      return `${b} ${PRESS_WORDS[a.how]}`;
    }
    case "stir": return "खाना चलाइए";
    case "flip": return "पलटिए";
    case "wait": return a.minutes ? `${a.minutes} मिनट रुकिए` : "थोड़ा रुकिए";
    case "place": return a.accessory ? PLACE_WORDS[a.accessory] : "अंदर रखिए";
    case "takeout": return "बाहर निकालिए";
  }
}

function ActionIcon({ action }: { action: Action }) {
  switch (action.kind) {
    case "press": return <span className="text-[1rem]">{PRESS_ICON[action.how]}</span>;
    case "stir": return <StirIcon small />;
    case "flip": return <FlipIcon small />;
    case "wait": return <ClockIcon small />;
    case "place": return <MiniOvenIcon small />;
    case "takeout": return <MiniOvenIcon small out />;
  }
}

function ActionList({ actions }: { actions: Action[] }) {
  const numbered = actions.length > 1;
  return (
    <ol className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
      {actions.map((a, i) => (
        <li key={i} className="flex items-center gap-1.5 rounded-xl bg-white px-2 py-1 text-[0.9375rem] font-bold leading-tight shadow-[0_0_0_1.5px_#e1edd2]">
          {numbered && (
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-genda text-[0.8125rem] font-extrabold">{i + 1}</span>
          )}
          <span className="grid shrink-0 place-items-center">
            <ActionIcon action={a} />
          </span>
          <span className="min-w-0 break-words">{actionWords(a)}</span>
        </li>
      ))}
    </ol>
  );
}

function ReadoutBox({ readout, big = false, narrow = false }: { readout: Readout; big?: boolean; narrow?: boolean }) {
  const allGo = readout.values.every((v) => v.goes);
  const someGo = readout.values.some((v) => v.goes);
  return (
    <div className={`rounded-xl bg-[#0e0c12] px-3 py-2 shadow-[inset_0_0_0_2px_#2a2733] ${narrow ? "max-w-[45%] shrink-0" : ""}`}>
      <p className="text-[0.9375rem] font-semibold leading-snug text-[#cfcde0]">
        {allGo ? "डिस्प्ले से यह हटेगा" : someGo ? "डिस्प्ले पर" : "डिस्प्ले पर दिखेगा"}
      </p>
      <div className="flex flex-wrap items-baseline gap-x-2">
        {readout.values.map((v, i) => {
          const m = v.text.match(/^(.*?)\s*(°C|℃|°)$/);
          return (
            <span key={v.text} className={`flex items-baseline gap-2 ${v.goes ? "opacity-60" : ""}`}>
              {i > 0 && <span className="text-[0.9375rem] font-bold text-[#cfcde0]">{readout.joins[i - 1] === "or" ? "या" : "→"}</span>}
              <span className={`led-glow font-led ${big ? "text-[2.125rem]" : "text-[1.5rem]"} leading-tight tracking-wider text-led ${v.goes ? "line-through decoration-rani decoration-2" : ""}`}>
                {m ? m[1] : v.text}
              </span>
              {m && <span className={`led-glow ${big ? "text-[1.5rem]" : "text-[1.125rem]"} font-bold text-led`}>°C</span>}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- inside the oven

const ACCESSORY_NAME: Record<Accessory, string> = {
  bowl: "माइक्रोवेव-सेफ बाउल",
  plate: "माइक्रोवेव-सेफ प्लेट",
  glass_tray: "ग्लास ट्रे",
  low_rack: "लो रैक",
  high_rack: "हाई रैक",
  rack: "रैक",
  tawa: "मल्टीकुक तवा",
  tawa_high: "तवा, हाई रैक पर",
  tawa_low: "तवा, लो रैक पर",
  tawa_rack: "तवा, रैक पर",
  air_fry_tray: "एयर फ्राई ट्रे",
  rotisserie: "रोटिसरी",
  popcorn: "पॉपकॉर्न का पैकेट",
};

/** "… रखिए" for each accessory, at a beep or in a list of things to do. */
const PLACE_WORDS: Record<Accessory, string> = {
  bowl: "बाउल अंदर रखिए",
  plate: "प्लेट अंदर रखिए",
  glass_tray: "ग्लास ट्रे पर रखिए",
  low_rack: "लो रैक पर रखिए",
  high_rack: "हाई रैक पर रखिए",
  rack: "रैक पर रखिए",
  tawa: "तवा अंदर रखिए",
  tawa_high: "तवा हाई रैक पर रखिए",
  tawa_low: "तवा लो रैक पर रखिए",
  tawa_rack: "तवा रैक पर रखिए",
  air_fry_tray: "एयर फ्राई ट्रे अंदर रखिए",
  rotisserie: "रोटिसरी अंदर लगाइए",
  popcorn: "पैकेट अंदर रखिए",
};

function Rack({ top }: { top: number }) {
  return (
    <g stroke="#c9ced6" strokeWidth="2.6" strokeLinecap="round">
      <line x1="80" y1={top} x2="158" y2={top} />
      {[90, 102, 114, 126, 138, 150].map((x) => <line key={x} x1={x} y1={top - 0.5} x2={x} y2={top + 0.5} strokeWidth="5" />)}
      <line x1="86" y1={top} x2="86" y2="110" />
      <line x1="152" y1={top} x2="152" y2="110" />
    </g>
  );
}

function Food({ y }: { y: number }) {
  return (
    <g>
      <rect x="98" y={y - 9} width="13" height="10" rx="3" fill="#f6d28b" stroke="#d9a74e" strokeWidth="1" />
      <rect x="113" y={y - 11} width="13" height="12" rx="3" fill="#f2a541" stroke="#cf7f1f" strokeWidth="1" />
      <rect x="128" y={y - 9} width="13" height="10" rx="3" fill="#9fd36b" stroke="#6ea43c" strokeWidth="1" />
    </g>
  );
}

function Tawa({ y }: { y: number }) {
  return (
    <g>
      <ellipse cx="119" cy={y} rx="38" ry="7.5" fill="#2b2b30" stroke="#5c5b63" strokeWidth="1.6" />
      <Food y={y - 1} />
    </g>
  );
}

function AccessoryDrawing({ accessory }: { accessory: Accessory }) {
  switch (accessory) {
    case "bowl":
      return (
        <g>
          <path d="M94 88 Q94 110 119 110 Q144 110 144 88 Z" fill="#d6ecff" fillOpacity="0.75" stroke="#9fcff4" strokeWidth="1.6" />
          <ellipse cx="119" cy="89" rx="23" ry="4.5" fill="#f2a541" />
          <ellipse cx="119" cy="88" rx="25" ry="5" fill="none" stroke="#9fcff4" strokeWidth="1.6" />
        </g>
      );
    case "plate":
    case "glass_tray":
      return (
        <g>
          <ellipse cx="119" cy="104" rx="31" ry="6.5" fill="#ffffff" stroke="#d9dde2" strokeWidth="1.4" />
          <ellipse cx="119" cy="100" rx="19" ry="6" fill="#f2a541" />
        </g>
      );
    case "low_rack":
    case "rack":
      return <g><Rack top={90} /><Food y={89} /></g>;
    case "high_rack":
      return <g><Rack top={70} /><Food y={69} /></g>;
    case "tawa":
      return <Tawa y={103} />;
    case "tawa_high":
      return <g><Rack top={70} /><Tawa y={67} /></g>;
    case "tawa_low":
    case "tawa_rack":
      return <g><Rack top={90} /><Tawa y={87} /></g>;
    case "air_fry_tray":
      return (
        <g>
          <ellipse cx="119" cy="102" rx="38" ry="8" fill="#3a3a41" stroke="#6b6a73" strokeWidth="1.6" />
          {[96, 106, 116, 126, 136].map((x) => <circle key={x} cx={x + 3} cy="103" r="1.4" fill="#8e8d96" />)}
          {[[100, -6, -12], [109, -10, 8], [118, -7, -6], [127, -11, 10], [136, -6, -8]].map(([x, dy, rot]) => (
            <rect key={x} x={x} y={102 + dy} width="5" height="15" rx="2" fill="#ffd25e" stroke="#e0a92a" strokeWidth="1" transform={`rotate(${rot} ${x + 2.5} 102)`} />
          ))}
        </g>
      );
    case "rotisserie":
      return (
        <g>
          <line x1="60" y1="70" x2="178" y2="70" stroke="#c9ced6" strokeWidth="3" strokeLinecap="round" />
          <ellipse cx="119" cy="72" rx="21" ry="15" fill="#c8793b" stroke="#9a5523" strokeWidth="1.5" />
          <ellipse cx="112" cy="67" rx="6" ry="3.5" fill="#e3a06a" />
        </g>
      );
    case "popcorn":
      return (
        <g>
          <rect x="104" y="80" width="30" height="28" rx="3" fill="#ffffff" stroke="#d9dde2" strokeWidth="1.2" />
          {[108, 116, 124].map((x) => <rect key={x} x={x} y="80" width="4" height="28" fill="#e5484d" />)}
          {[[110, 78], [119, 75], [128, 78]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="5" fill="#fff7d6" stroke="#f0d98a" strokeWidth="1" />)}
        </g>
      );
  }
}

/** The oven with its door open; an arrow shows food going in, or (out) coming out. */
function Oven({ accessory, out = false }: { accessory: Accessory | null; out?: boolean }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <svg viewBox="0 0 240 150" className="w-[58%] shrink-0">
      <defs>
        <linearGradient id={`${uid}-glass`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2c2934" />
          <stop offset="1" stopColor="#121016" />
        </linearGradient>
        <radialGradient id={`${uid}-light`} cx="0.5" cy="0" r="0.9">
          <stop offset="0" stopColor="#fff2c4" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff2c4" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="128" cy="143" rx="94" ry="5" fill="#3a1f3d" opacity="0.12" />
      <rect x="44" y="14" width="190" height="122" rx="20" fill={`url(#${uid}-glass)`} />
      <rect x="56" y="26" width="126" height="98" rx="12" fill="#2a2631" />
      <rect x="56" y="26" width="126" height="98" rx="12" fill={`url(#${uid}-light)`} />
      {/* control strip */}
      <rect x="192" y="30" width="32" height="14" rx="4" fill="#0b0a0e" />
      <rect x="199" y="35" width="18" height="4" rx="2" fill="#b7b4ff" opacity="0.8" />
      {[198, 208, 218].map((x) => <g key={x}><circle cx={x} cy="56" r="2" fill="#6c6977" /><circle cx={x} cy="66" r="2" fill="#6c6977" /></g>)}
      <circle cx="208" cy="90" r="10" fill="#26232d" stroke="#c8a25c" strokeWidth="2.4" />
      <rect x="195" y="112" width="11" height="2.5" rx="1" fill="#e5484d" />
      <rect x="210" y="112" width="11" height="2.5" rx="1" fill="#e7e6ea" />
      {/* the door, swung open */}
      <polygon points="44,18 8,32 8,120 44,132" fill="#201d26" />
      <g fill="none" stroke="#c8a25c" strokeWidth="1.6" strokeLinecap="round" opacity="0.85">
        <path d="M14 112 C 20 100, 22 90, 30 78" />
        <path d="M19 102 C 12 98, 12 90, 15 85 C 20 88, 22 95, 19 102 Z" />
        <path d="M25 90 C 21 84, 22 77, 26 73 C 30 78, 30 85, 25 90 Z" />
      </g>
      {/* glass tray and what goes on it */}
      <ellipse cx="119" cy="112" rx="53" ry="8" fill="#d6ecff" fillOpacity="0.5" stroke="#a9d3f5" strokeWidth="1.5" />
      {accessory ? <AccessoryDrawing accessory={accessory} /> : out && <ellipse cx="119" cy="102" rx="19" ry="6" fill="#f2a541" />}
      {/* "put it in" or "take it out" arrow */}
      <g className="pic-bob">
        {out ? (
          <>
            <path d="M119 52 L119 34" stroke="#ff5c9a" strokeWidth="4.5" strokeLinecap="round" />
            <path d="M111 40 L119 31 L127 40" fill="none" stroke="#ff5c9a" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
          </>
        ) : (
          <>
            <path d="M119 32 L119 50" stroke="#ff5c9a" strokeWidth="4.5" strokeLinecap="round" />
            <path d="M111 44 L119 53 L127 44" fill="none" stroke="#ff5c9a" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}
      </g>
    </svg>
  );
}

function Caption({ title, chip, note }: { title: string; chip?: string; note?: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
      <p className="text-[1.1875rem] font-extrabold leading-tight">{title}</p>
      {chip && <span className="rounded-xl bg-white px-2.5 py-1 text-[0.9375rem] font-bold leading-tight shadow-[0_0_0_1.5px_#e1edd2]">{chip}</span>}
      {note && <span className="text-[0.9375rem] font-semibold text-baingan-soft">{note}</span>}
    </div>
  );
}

// ---------------------------------------------------------------- at the beep, and small scenes

function beepWords(action: BeepAction, accessory: Accessory | null, minutes?: string): string {
  switch (action) {
    case "flip": return "पलटिए";
    case "add": return "बाकी चीज़ें डालिए";
    case "stir": return "चलाइए";
    case "place": return accessory ? PLACE_WORDS[accessory] : "अंदर रखिए";
    case "takeout": return "बाहर निकालिए";
    case "wait": return minutes ? `${minutes} मिनट रुकिए` : "थोड़ा रुकिए";
    case "open": return "दरवाज़ा खोलिए";
  }
}

function Beep({ action, accessory, minutes, then }: {
  action: BeepAction;
  accessory: Accessory | null;
  minutes?: string;
  then: ButtonId[];
}) {
  const icon = action === "flip" ? <FlipIcon /> : action === "stir" ? <StirIcon /> : action === "wait" ? <ClockIcon />
    : action === "add" ? <PourIcon /> : action === "place" ? <MiniOvenIcon /> : action === "takeout" ? <MiniOvenIcon out /> : <DoorIcon />;
  return (
    <div className="flex items-center gap-2">
      <div className="relative shrink-0">
        <Mascot mood="happy" size={86} still />
        <span className="pic-pop absolute -right-2 -top-2 rounded-[14px] rounded-bl-sm bg-rani px-2.5 py-0.5 text-[1rem] font-extrabold text-white">बीप!</span>
      </div>
      <span aria-hidden className="text-[1.375rem] font-bold text-baingan-soft">→</span>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
        <div className="flex items-center gap-2">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-genda-soft">{icon}</span>
          <span className="min-w-0 text-[1.125rem] font-extrabold leading-tight">{beepWords(action, accessory, minutes)}</span>
        </div>
        {then.length > 0 && (
          <span className="text-[1.0625rem] font-bold">
            फिर {then.map((id) => <ButtonChip key={id} id={id} />)}
          </span>
        )}
      </div>
    </div>
  );
}

function IconScene({ icon, title, note, chip }: { icon: ReactNode; title: string; note?: string; chip?: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="pic-pop grid size-16 shrink-0 place-items-center rounded-full bg-genda-soft">{icon}</span>
      <Caption title={title} note={note} chip={chip} />
    </div>
  );
}

const iconSize = (small?: boolean) => (small ? "size-6" : "size-10");

function FlipIcon({ small }: { small?: boolean }) {
  return (
    <svg viewBox="0 0 48 48" className={iconSize(small)}>
      <rect x="15" y="20" width="18" height="10" rx="3" fill="#f2a541" stroke="#cf7f1f" strokeWidth="1.5" />
      <g className="pic-spin" fill="none" stroke="#d6246e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 18 A14 14 0 0 1 36 14" />
        <path d="M32 9 L37 14 L31 17" />
        <path d="M38 30 A14 14 0 0 1 12 34" />
        <path d="M16 39 L11 34 L17 31" />
      </g>
    </svg>
  );
}

function StirIcon({ small }: { small?: boolean }) {
  return (
    <svg viewBox="0 0 48 48" className={iconSize(small)}>
      <path d="M9 24 Q9 40 24 40 Q39 40 39 24 Z" fill="#d6ecff" stroke="#9fcff4" strokeWidth="1.6" />
      <ellipse cx="24" cy="25" rx="14" ry="3" fill="#f2a541" />
      <g className="pic-spin">
        <line x1="30" y1="6" x2="22" y2="26" stroke="#8a6a4a" strokeWidth="3" strokeLinecap="round" />
        <ellipse cx="21" cy="27" rx="3.5" ry="2" fill="#8a6a4a" />
      </g>
    </svg>
  );
}

/** The tawa or the air-fry tray with food on it, on the counter. */
function CounterIcon({ accessory }: { accessory: "tawa" | "air_fry_tray" }) {
  return (
    <svg viewBox="76 82 86 32" className="w-12">
      <AccessoryDrawing accessory={accessory} />
    </svg>
  );
}

/** A bowl with something going into it. */
function PourIcon({ small }: { small?: boolean }) {
  return (
    <svg viewBox="0 0 48 48" className={iconSize(small)}>
      <path d="M9 26 Q9 41 24 41 Q39 41 39 26 Z" fill="#d6ecff" stroke="#9fcff4" strokeWidth="1.6" />
      <ellipse cx="24" cy="27" rx="14" ry="3" fill="#f2a541" />
      <g className="pic-bob">
        <circle cx="20" cy="12" r="3.2" fill="#9fd36b" />
        <circle cx="27" cy="8" r="3.2" fill="#e5484d" />
        <circle cx="26" cy="17" r="3.2" fill="#ffd25e" />
      </g>
    </svg>
  );
}

function ClockIcon({ small }: { small?: boolean }) {
  return (
    <svg viewBox="0 0 48 48" className={iconSize(small)}>
      <circle cx="24" cy="26" r="16" fill="#ffffff" stroke="#d6246e" strokeWidth="3" />
      <rect x="20" y="5" width="8" height="5" rx="2" fill="#d6246e" />
      <g className="pic-spin" style={{ transformBox: "view-box", transformOrigin: "24px 26px" }}>
        <line x1="24" y1="26" x2="24" y2="15" stroke="#3a1f3d" strokeWidth="3" strokeLinecap="round" />
      </g>
      <circle cx="24" cy="26" r="2.5" fill="#3a1f3d" />
    </svg>
  );
}

function DoorIcon() {
  return (
    <svg viewBox="0 0 48 48" className="size-10">
      <rect x="14" y="10" width="26" height="28" rx="4" fill="#17151c" />
      <polygon points="14,11 4,16 4,34 14,37" fill="#2d2a34" />
      <rect x="18" y="14" width="18" height="20" rx="3" fill="#fff2c4" opacity="0.7" />
    </svg>
  );
}

function MiniOvenIcon({ small, out = false }: { small?: boolean; out?: boolean }) {
  return (
    <svg viewBox="0 0 48 48" className={iconSize(small)}>
      <rect x="6" y="10" width="36" height="28" rx="5" fill="#17151c" />
      <rect x="10" y="14" width="22" height="20" rx="3" fill="#fff2c4" opacity="0.6" />
      <line x1="12" y1="27" x2="30" y2="27" stroke="#c9ced6" strokeWidth="2" />
      <path d={out ? "M21 24 L21 15 M17 18 L21 14 L25 18" : "M21 13 L21 22 M17 19 L21 23 L25 19"} stroke="#d6246e" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
