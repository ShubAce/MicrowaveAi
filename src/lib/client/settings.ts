"use client";

import { DEFAULT_PACE, DEFAULT_VOICE, isVoiceId, type VoiceId } from "../voices";

export interface Settings {
  voice: VoiceId;
  pace: number;
  /** How the greeting addresses her, e.g. "मम्मी जी". */
  name: string;
  bigText: boolean;
}

const KEY = "sakhi.settings";
export const DEFAULT_SETTINGS: Settings = { voice: DEFAULT_VOICE, pace: DEFAULT_PACE, name: "जी", bigText: false };

function read(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return {
      voice: isVoiceId(raw.voice) ? raw.voice : DEFAULT_SETTINGS.voice,
      pace: typeof raw.pace === "number" ? raw.pace : DEFAULT_SETTINGS.pace,
      name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, 24) : DEFAULT_SETTINGS.name,
      bigText: raw.bigText === true,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

// A tiny store for useSyncExternalStore: the server renders the defaults, the phone its saved settings.
let current: Settings | null = null;
const listeners = new Set<() => void>();

export const settingsStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  get: (): Settings => (current ??= read()),
  getServer: (): Settings => DEFAULT_SETTINGS,
  set(s: Settings) {
    current = s;
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      // private mode or storage blocked: settings last until the page closes
    }
    listeners.forEach((l) => l());
  },
};
