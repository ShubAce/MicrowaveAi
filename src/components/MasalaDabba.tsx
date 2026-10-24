"use client";

import type { Tile } from "@/lib/tiles";

// Spice colours for the katoris: haldi, mirch, dhaniya, jeera, rai, garam masala, namak.
const SPICES = ["#ffe08a", "#ffbcb0", "#cfe9ad", "#efd6b0", "#e0d5ee", "#ffd3a8", "#f7f3ea"];

/** Quick questions laid out like a masala dabba: one katori in the middle, six around it. */
export function MasalaDabba({ tiles, onPick }: { tiles: Tile[]; onPick: (t: Tile) => void }) {
  const [center, ...ring] = tiles;
  const spots = [
    { tile: center, x: 50, y: 50, color: SPICES[6] },
    ...ring.slice(0, 6).map((tile, i) => {
      const a = ((-90 + i * 60) * Math.PI) / 180;
      return { tile, x: 50 + 33 * Math.cos(a), y: 50 + 33 * Math.sin(a), color: SPICES[i] };
    }),
  ];

  return (
    <div className="relative mx-auto aspect-square w-[min(90vw,350px)] rounded-full bg-[radial-gradient(circle_at_32%_28%,#ffffff_0%,#dfe3e8_45%,#b6bec8_100%)] shadow-[0_14px_28px_rgb(58_31_61/0.16),inset_0_-8px_14px_rgb(0_0_0/0.12)]">
      <div aria-hidden className="absolute inset-[3.5%] rounded-full border-[3px] border-white/70 shadow-[inset_0_2px_6px_rgb(0_0_0/0.12)]" />
      {spots.map(({ tile, x, y, color }) => (
        <button
          key={tile.id}
          type="button"
          onClick={() => onPick(tile)}
          style={{ left: `${x - 15.5}%`, top: `${y - 15.5}%`, background: color }}
          className="absolute flex size-[31%] flex-col items-center justify-center rounded-full shadow-[0_0_0_3px_#eef0f3,0_3px_0_4px_#aeb6c0,inset_0_5px_10px_rgb(0_0_0/0.13)] transition-transform active:scale-95"
        >
          <span aria-hidden className="text-[30px] leading-none">{tile.emoji}</span>
          <span className="mt-1 px-1 text-center text-[16px] font-bold leading-[1.1] text-baingan">{tile.label}</span>
        </button>
      ))}
    </div>
  );
}
