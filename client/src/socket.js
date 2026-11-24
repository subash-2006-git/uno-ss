import { io } from 'socket.io-client';

export const socket = io({ autoConnect: false });

// Promise wrapper around socket.io acknowledgements.
export const send = (event, payload) =>
  new Promise((resolve) => {
    socket.timeout(8000).emit(event, payload ?? {}, (err, res) =>
      resolve(err ? { ok: false, error: 'No response from server' } : res));
  });

const KEY = 'uno-huh-session-v2'; // { token, user }
export const loadSession = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
export const saveSession = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ } };
export const clearSession = () => { try { localStorage.removeItem(KEY); } catch { /* ignore */ } };
