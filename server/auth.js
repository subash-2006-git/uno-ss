import { scrypt, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

export async function hashPassword(pw) {
  const salt = randomBytes(16);
  const key = await scryptAsync(pw, salt, 64);
  return `${salt.toString('hex')}:${key.toString('hex')}`;
}

export async function verifyPassword(pw, stored) {
  const [saltHex, keyHex] = String(stored).split(':');
  if (!saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, 'hex');
  const actual = await scryptAsync(pw, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(actual, expected);
}

export const newToken = () => randomBytes(32).toString('hex');
export const hashToken = (t) => createHash('sha256').update(String(t)).digest('hex');

export function validateUsername(u) {
  return /^[A-Za-z0-9_]{3,16}$/.test(u ?? '') ? null : 'Username must be 3-16 letters, numbers or underscores';
}
export function validatePassword(p) {
  if (typeof p !== 'string' || p.length < 8) return 'Password must be at least 8 characters';
  if (p.length > 72) return 'Password is too long (72 max)';
  return null;
}

// General sliding-window limiter: allow(key, max, windowMs) is true while fewer than `max` hits happened in the window.
const hits = new Map();
export function allow(key, max, windowMs, now = Date.now()) {
  const recentHits = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recentHits.length >= max) { hits.set(key, recentHits); return false; }
  recentHits.push(now);
  hits.set(key, recentHits);
  return true;
}
// Forget idle keys so the map cannot grow forever.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > 3600e3) hits.delete(k);
}, 600e3).unref();

// Tiny in-memory brake on password guessing: 8 failures per 10 minutes per ip+username.
const fails = new Map();
const WINDOW = 10 * 60 * 1000;
const recent = (key) => (fails.get(key) ?? []).filter((t) => Date.now() - t < WINDOW);
export const isLockedOut = (key) => recent(key).length >= 8;
export const noteFailure = (key) => fails.set(key, [...recent(key), Date.now()]);
export const clearFailures = (key) => fails.delete(key);
