"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { BUTTONS, type ButtonId } from "@/lib/buttons";
import { HeaderTrim } from "./Floral";
import { ButtonChip, LedBadge } from "./PanelBits";

// Every dish the microwave makes by itself, grouped the way the panel buttons are, so she can
// discover what to ask for. Built by scripts/build_kb.py into public/recipe-book.json.

interface Group {
  category: string;
  title: string;
  button: string;
  groupNo: string | null;
  items: { code: string; hi: string; en: string }[];
}

const BUTTON_IDS: Record<string, ButtonId> = {
  "Charcoal/Indian Cuisine": "CHARCOAL",
  "Healthy Heart": "HEALTHY_HEART",
  "Indian Roti Basket/Ghee": "ROTI_GHEE",
  "Air Fry/Low Calorie": "AIR_FRY",
  "Kids'/Dairy Delight": "KIDS_DAIRY",
};

const EMOJI: Record<string, string> = {
  Charcoal: "🔥",
  "Indian Cuisine": "🍛",
  "Rice Delight": "🍚",
  "Chatpat Corner": "🌶️",
  "Cooking Aid": "🥄",
  "Healthy Heart": "❤️",
  "Indian Roti Basket": "🫓",
  Ghee: "🧈",
  "Air Fry": "🍟",
  "Low Calorie": "🥗",
  "Child's Favourite": "🍕",
  Bakery: "🎂",
  "Dairy Delight": "🥛",
  "Pasteurized Milk": "🍼",
};

export function RecipeBook({ onAsk, onBack }: { onAsk: (question: string) => void; onBack: () => void }) {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/recipe-book.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((g: Group[]) => live && setGroups(g))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  const total = groups?.reduce((n, g) => n + g.items.length, 0) ?? 331;

  return (
    <main className="flex min-h-dvh flex-col px-4 pb-10 pt-3">
      <header className="sticky top-0 z-10 -mx-4 flex items-center gap-3 bg-pista/95 px-4 py-2 backdrop-blur">
        <button
          type="button"
          onClick={onBack}
          aria-label="शुरू पर जाएँ"
          className="grid size-12 shrink-0 place-items-center rounded-full bg-white shadow-[0_0_0_2px_var(--color-pista-line)]"
        >
          <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <div>
          <h1 className="text-[1.625rem] font-extrabold leading-tight">रेसिपी किताब</h1>
          <p className="text-[1rem] text-baingan-soft">{total} चीज़ें, जो आपका माइक्रोवेव अपने-आप बनाता है</p>
        </div>
        <HeaderTrim />
      </header>

      <p className="mt-3 rounded-[18px] bg-white px-4 py-3 text-[1.125rem] leading-snug shadow-[0_0_0_2px_var(--color-pista-line)]">
        किसी भी चीज़ को दबाइए, सखी पूरा तरीका बोलकर बताएगी।
      </p>

      {failed && <p className="mt-6 text-center text-[1.1875rem]">किताब नहीं खुल पाई। इंटरनेट देखकर फिर कोशिश कीजिए।</p>}
      {!groups && !failed && <p className="mt-6 text-center text-[1.1875rem] text-baingan-soft">किताब खुल रही है…</p>}

      <div className="mt-4 flex flex-col gap-3">
        {groups?.map((g) => {
          const isOpen = open === g.category;
          const buttonId = BUTTON_IDS[g.button];
          return (
            <section key={g.category} className="overflow-hidden rounded-[22px] bg-white shadow-[0_0_0_2px_var(--color-pista-line)]">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : g.category)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                <span aria-hidden className="grid size-14 shrink-0 place-items-center rounded-full bg-genda-soft text-[1.875rem]">{EMOJI[g.category] ?? "🍽️"}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[1.3125rem] font-extrabold leading-tight">{g.title}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[0.9375rem] leading-snug text-baingan-soft">
                    <span className="whitespace-nowrap">
                      {buttonId && <ButtonChip id={buttonId} />}
                      {g.groupNo && <> → <LedBadge text={g.groupNo} /></>}
                    </span>
                    <span className="font-semibold">{g.items.length} चीज़ें</span>
                  </span>
                </span>
                <span aria-hidden className={`text-[1.375rem] transition-transform ${isOpen ? "rotate-180" : ""}`}>⌄</span>
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: "auto" }}
                    exit={{ height: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden"
                  >
                    <div className="grid grid-cols-2 gap-2 px-3 pb-4">
                      {g.items.map((item) => (
                        <button
                          key={item.code}
                          type="button"
                          onClick={() => onAsk(`${item.hi} कैसे बनाते हैं?`)}
                          className="flex min-h-16 flex-col items-start justify-center gap-1 rounded-2xl bg-pista px-3 py-2 text-left active:bg-genda-soft"
                        >
                          <span className="text-[1.125rem] font-bold leading-tight">{item.hi}</span>
                          <span className="text-[0.875rem] text-baingan-soft">
                            {BUTTONS[buttonId]?.hint ?? ""} <LedBadge text={item.code} />
                          </span>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </section>
          );
        })}
      </div>
    </main>
  );
}
