// Tiny synthesized sound effects (Web Audio): no audio files to download, so it costs no bandwidth.
import { getSettings } from './settings.js';

let ctx = null;
function audio() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

// Browsers only allow audio after a user gesture: unlock on the first tap/click.
export function installAudioUnlock() {
  const unlock = () => { audio(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

function tone(c, vol, freq, dur, { type = 'sine', at = 0, gain = 0.25, to } = {}) {
  const t0 = c.currentTime + at;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * vol), t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

const SOUNDS = {
  select: (c, v) => tone(c, v, 660, 0.05, { type: 'triangle', gain: 0.15 }),
  play: (c, v) => { tone(c, v, 440, 0.07, { type: 'triangle' }); tone(c, v, 660, 0.09, { type: 'triangle', at: 0.05 }); },
  draw: (c, v) => tone(c, v, 420, 0.14, { type: 'sine', to: 200 }),
  action: (c, v) => { tone(c, v, 300, 0.2, { type: 'sawtooth', to: 900, gain: 0.16 }); tone(c, v, 500, 0.1, { type: 'triangle', at: 0.18 }); },
  turn: (c, v) => { tone(c, v, 880, 0.12, { type: 'sine' }); tone(c, v, 1320, 0.16, { type: 'sine', at: 0.09 }); },
  tick: (c, v) => tone(c, v, 1000, 0.04, { type: 'square', gain: 0.07 }),
  uno: (c, v) => [523, 659, 784].forEach((f, i) => tone(c, v, f, 0.12, { type: 'square', at: i * 0.08, gain: 0.14 })),
  win: (c, v) => [523, 659, 784, 1047].forEach((f, i) => tone(c, v, f, 0.2, { type: 'triangle', at: i * 0.12 })),
  end: (c, v) => [440, 349, 262].forEach((f, i) => tone(c, v, f, 0.2, { type: 'triangle', at: i * 0.12, gain: 0.18 })),
  error: (c, v) => tone(c, v, 160, 0.18, { type: 'sawtooth', gain: 0.15 }),
};

export function play(name) {
  const s = getSettings();
  if (!s.sound || s.volume <= 0) return;
  const c = audio();
  if (!c || c.state !== 'running') return;
  try { SOUNDS[name]?.(c, s.volume); } catch { /* audio is optional */ }
}
