"use client";

import { AnimatePresence, motion } from "motion/react";
import type { Settings } from "@/lib/client/settings";
import { PACES, VOICES } from "@/lib/voices";
import { SheetSprig } from "./Floral";

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
}

/** For the family: voice, speed, how the greeting addresses her, text size, installing the app. */
export function SettingsSheet({ open, settings, onChange, onClose, onPreview, installPrompt }: {
  open: boolean;
  settings: Settings;
  onChange: (s: Settings) => void;
  onClose: () => void;
  onPreview: (voice: Settings["voice"]) => void;
  installPrompt: InstallPrompt | null;
}) {

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-30 bg-baingan/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.section
            key="sheet"
            role="dialog"
            aria-label="सेटिंग"
            className="fixed inset-x-0 bottom-0 z-40 mx-auto max-h-[88dvh] max-w-130 overflow-y-auto rounded-t-[30px] bg-white px-5 pb-10 pt-3"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
          >
            <div aria-hidden className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-pista-line" />
            <SheetSprig />
            <div className="flex items-center justify-between">
              <h2 className="text-[1.625rem] font-extrabold">सेटिंग</h2>
              <button type="button" onClick={onClose} className="rounded-full bg-pista px-4 py-2 text-[1.125rem] font-bold">
                बंद करें
              </button>
            </div>

            <h3 className="mt-6 text-[1.25rem] font-bold">सखी की आवाज़</h3>
            <p className="text-[1.0625rem] text-baingan-soft">जो आवाज़ सुनने में सबसे अच्छी लगे, वही चुनिए।</p>
            <div className="mt-3 flex flex-col gap-2">
              {VOICES.map((v) => {
                const on = settings.voice === v.id;
                return (
                  <div key={v.id} className={`flex items-center gap-3 rounded-[18px] border-2 px-3 py-2.5 ${on ? "border-rani bg-rani-soft" : "border-pista-line"}`}>
                    <button type="button" onClick={() => onChange({ ...settings, voice: v.id })} className="flex flex-1 flex-col items-start text-left">
                      <span className="text-[1.25rem] font-bold">{v.name}{on && " ✓"}</span>
                      <span className="text-[1rem] text-baingan-soft">{v.note} आवाज़</span>
                    </button>
                    <button type="button" onClick={() => onPreview(v.id)} className="rounded-full bg-white px-4 py-2 text-[1.0625rem] font-bold shadow-[0_0_0_2px_var(--color-pista-line)]">
                      ▶ सुनें
                    </button>
                  </div>
                );
              })}
            </div>

            <h3 className="mt-7 text-[1.25rem] font-bold">बोलने की रफ़्तार</h3>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {PACES.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => onChange({ ...settings, pace: p.value })}
                  className={`rounded-[16px] border-2 py-3 text-[1.1875rem] font-bold ${settings.pace === p.value ? "border-rani bg-rani-soft" : "border-pista-line"}`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <h3 className="mt-7 text-[1.25rem] font-bold">नमस्ते किसे कहें</h3>
            <input
              key={settings.name}
              defaultValue={settings.name}
              onBlur={(e) => onChange({ ...settings, name: e.target.value.trim() || "जी" })}
              placeholder="जैसे: मम्मी जी"
              className="mt-2 w-full rounded-[16px] border-2 border-pista-line px-4 py-3 text-[1.25rem] outline-none focus:border-rani"
            />

            <label className="mt-7 flex items-center justify-between gap-3">
              <span className="text-[1.25rem] font-bold">और बड़े अक्षर</span>
              <input
                type="checkbox"
                checked={settings.bigText}
                onChange={(e) => onChange({ ...settings, bigText: e.target.checked })}
                className="size-7 accent-rani"
              />
            </label>

            <h3 className="mt-7 text-[1.25rem] font-bold">फ़ोन की होम स्क्रीन पर लगाएँ</h3>
            {installPrompt ? (
              <button type="button" onClick={() => installPrompt.prompt()} className="mt-2 w-full rounded-[18px] bg-rani py-3.5 text-[1.25rem] font-bold text-white">
                होम स्क्रीन पर लगाएँ
              </button>
            ) : (
              <p className="mt-1 text-[1.125rem] leading-snug text-baingan-soft">
                Chrome में ऊपर ⋮ दबाइए और “होम स्क्रीन पर जोड़ें” या “ऐप इंस्टॉल करें” चुनिए। iPhone पर Safari में शेयर बटन से “Add to Home Screen” चुनिए।
              </p>
            )}

            <p className="mt-8 text-[0.9375rem] leading-snug text-baingan-soft">
              सखी के जवाब LG MJEN286UGWF के मैनुअल (MFL72046002) से आते हैं। आवाज़ Sarvam AI की है और समझ Google Gemini की।
            </p>
          </motion.section>
        </>
      )}
    </AnimatePresence>
  );
}
