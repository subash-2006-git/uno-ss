import { useSyncExternalStore } from 'react';

// Per-device preferences, stored in localStorage.
//   gfx: 'high' (all effects) | 'medium' (short animations only) | 'low' (data saver: no effects)
const KEY = 'uno-huh-settings';

function detectDefaults() {
  let slowNet = false, weakDevice = false, reduceMotion = false, touch = false;
  try {
    const c = navigator.connection;
    slowNet = Boolean(c && (c.saveData || /2g|3g/.test(c.effectiveType || '')));
    weakDevice = (navigator.deviceMemory && navigator.deviceMemory <= 2) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2);
    reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    touch = matchMedia('(pointer: coarse)').matches;
  } catch { /* old browser: keep defaults */ }
  return {
    gfx: slowNet || weakDevice || reduceMotion ? 'low' : 'high',
    sound: true,
    volume: 0.6,
    confirmTap: touch, // phones: tap a card to raise it, tap again to play
    autoDetected: slowNet || weakDevice || reduceMotion,
  };
}

function load() {
  const defaults = detectDefaults();
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved && typeof saved === 'object') return { ...defaults, ...saved, autoDetected: false };
  } catch { /* ignore */ }
  return defaults;
}

let state = load();
const listeners = new Set();
const apply = () => { try { document.documentElement.dataset.gfx = state.gfx; } catch { /* ignore */ } };
apply();

export const getSettings = () => state;

export function updateSettings(patch) {
  state = { ...state, ...patch, autoDetected: false };
  apply();
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}

export const useSettings = () => useSyncExternalStore(
  (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
  getSettings,
);
