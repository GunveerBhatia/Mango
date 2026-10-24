"use client";

// The slip, saved slips and settings, persisted in this browser's localStorage.
// Exposed through useSlip() (useSyncExternalStore), so every component stays in sync.

import { useSyncExternalStore } from "react";
import { americanToDecimal } from "../odds-math";
import { DEFAULT_SETTINGS, type Leg, type SavedLeg, type SavedSlip, type Settings } from "./types";

interface State {
  /** False until this browser's saved data has been read. */
  ready: boolean;
  legs: Leg[];
  saved: SavedSlip[];
  settings: Settings;
  open: boolean;
  /** When the slip was last opened (ms), to flag games that already started. */
  openedAt?: number;
  /** Last message shown at the top of the slip (e.g. leg cap reached). */
  flash?: string;
}

const KEY = "slip.v1";
const EMPTY: State = { ready: false, legs: [], saved: [], settings: DEFAULT_SETTINGS, open: false };

let state: State = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  state = { ...state, ready: true };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      state = {
        ...EMPTY,
        ready: true,
        legs: Array.isArray(p.legs) ? p.legs : [],
        saved: Array.isArray(p.saved) ? p.saved : [],
        settings: { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) },
      };
    }
  } catch {
    // Private mode or corrupted data: start fresh.
  }
}

function set(next: Partial<State>) {
  state = { ...state, ...next };
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ legs: state.legs, saved: state.saved, settings: state.settings }));
  } catch {
    // Storage full or blocked; keep working in memory.
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  load();
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      loaded = false;
      load();
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot() {
  load();
  return state;
}

export function useSlip(): State {
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}

export const slipActions = {
  toggle(leg: Leg) {
    if (state.legs.some((l) => l.id === leg.id)) {
      set({ legs: state.legs.filter((l) => l.id !== leg.id), flash: undefined });
      return;
    }
    if (state.legs.length >= state.settings.maxLegs) {
      set({
        open: true,
        flash: `Slip is capped at ${state.settings.maxLegs} legs. Each leg adds the book's cut again — remove one first, or raise the cap in My Record → Settings.`,
      });
      return;
    }
    set({ legs: [...state.legs, leg], flash: undefined });
  },
  /** Replace the slip with a suggested parlay and open it. */
  replace(legs: Leg[]) {
    set({ legs: legs.slice(0, state.settings.maxLegs), open: true, openedAt: Date.now(), flash: undefined });
  },
  remove(id: string) {
    set({ legs: state.legs.filter((l) => l.id !== id), flash: undefined });
  },
  clear() {
    set({ legs: [], flash: undefined });
  },
  setOpen(open: boolean) {
    set({ open, flash: open ? state.flash : undefined, openedAt: open ? Date.now() : state.openedAt });
  },
  save(stake: number) {
    const s = state.settings;
    const decimal = state.legs.reduce((p, l) => p * americanToDecimal(l.american), 1);
    const slip: SavedSlip = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
      legs: state.legs.map((l): SavedLeg => ({ ...l, result: "pending" })),
      stake,
      decimalAtSave: decimal,
      bankrollAtSave: s.bankroll,
      unitSize: s.bankroll ? s.bankroll / 100 : undefined,
    };
    set({ saved: [slip, ...state.saved], legs: [], open: false, flash: undefined });
  },
  updateLeg(slipId: string, legId: string, patch: Partial<SavedLeg>) {
    set({
      saved: state.saved.map((s) =>
        s.id === slipId ? { ...s, legs: s.legs.map((l) => (l.id === legId ? { ...l, ...patch } : l)) } : s,
      ),
    });
  },
  deleteSlip(id: string) {
    set({ saved: state.saved.filter((s) => s.id !== id) });
  },
  updateSettings(patch: Partial<Settings>) {
    set({ settings: { ...state.settings, ...patch } });
  },
};
