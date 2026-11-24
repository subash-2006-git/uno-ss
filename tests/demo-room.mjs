// Dev helper: a room of 3 bot players that start a game right away and keep playing (random legal moves),
// plus chat and reactions. Join it from the browser to try spectating, late joining, chat and the animations.
//   1. ADMIN_USERNAME=admin ADMIN_PASSWORD=adminpass123 DATABASE_URL= node server/index.js
//   2. node tests/demo-room.mjs        (prints the room code and the demo login)
//   3. open http://localhost:3001, log in as the demo user, join the room (you will watch, then ask for a seat)
import { io } from 'socket.io-client';
import { isPlayable } from '../shared/uno.js';

const URL = process.env.URL || 'http://localhost:3001';
const ADMIN = { username: process.env.ADMIN_USERNAME || 'admin', password: process.env.ADMIN_PASSWORD || 'adminpass123' };
const DEMO = { username: 'viewer', password: 'viewer-pass-1' };
const BOTS = ['Maya', 'Leo', 'Zoe'];
const THINK_MS = Number(process.env.THINK_MS || 2200);

const http = async (path, { method = 'GET', body, token } = {}) => {
  const res = await fetch(URL + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { ...(await res.json().catch(() => ({}))), status: res.status };
};
const send = (s, ev, p) => new Promise((r) => s.emit(ev, p ?? {}, r));

const admin = await http('/api/login', { method: 'POST', body: ADMIN });
if (admin.status !== 200) throw new Error('admin login failed');
const users = [...BOTS, DEMO.username];
for (const username of users) {
  await http('/api/signup', { method: 'POST', body: { username, password: username === DEMO.username ? DEMO.password : 'bot-pass-123' } });
}
const list = (await http('/api/admin/users', { token: admin.token })).users;
for (const u of list.filter((x) => users.includes(x.username))) {
  await http(`/api/admin/users/${u.id}/approve`, { method: 'POST', token: admin.token });
}

const bots = [];
for (const name of BOTS) {
  const login = await http('/api/login', { method: 'POST', body: { username: name, password: 'bot-pass-123' } });
  const socket = io(URL, { forceNew: true });
  await new Promise((r) => socket.on('connect', r));
  const bot = { name, id: login.user.id, socket, room: null, busy: false };
  socket.on('room_update', (r) => { bot.room = r; think(bot); });
  await send(socket, 'auth', { token: login.token });
  bots.push(bot);
}

// A bot plays a random legal move a moment after it becomes its turn.
function think(bot) {
  const g = bot.room?.game;
  if (!g || bot.busy) return;
  const mover = g.phase === 'challenge' ? g.pending?.challenger : g.phase === 'play' ? g.turn : null;
  if (g.phase === 'roundOver') { if (bot === bots[0]) { bot.busy = true; setTimeout(async () => { await send(bot.socket, 'next_round'); bot.busy = false; }, 3500); } return; }
  if (g.phase === 'matchOver' || mover !== bot.id) return;
  bot.busy = true;
  setTimeout(async () => {
    const v = bot.room?.game;
    if (!v) { bot.busy = false; return; } // the room changed under us (bot moved to another room)
    if (v.phase === 'challenge') await send(bot.socket, 'challenge', { accept: Math.random() < 0.7 });
    else {
      const ok = v.hand.filter((c) => isPlayable(c, v.top, v.color) && (v.drawnCardId == null || c.id === v.drawnCardId));
      if (ok.length) {
        const card = ok.find((c) => c.color !== 'wild') ?? ok[0];
        const color = ['red', 'yellow', 'green', 'blue'][Math.floor(Math.random() * 4)];
        await send(bot.socket, 'play_card', { cardId: card.id, color });
        if (v.hand.length === 2 && !process.env.NO_UNO) await send(bot.socket, 'call_uno'); // NO_UNO=1: bots forget, so Catch! can be tested
      } else if (v.drawnCardId != null) await send(bot.socket, 'pass_turn');
      else await send(bot.socket, 'draw_card');
    }
    bot.busy = false;
    think(bot);
  }, THINK_MS + Math.random() * Number(process.env.JITTER_MS ?? 800));
}

// JOIN=ABCDE: the bots just join a room you created (so you stay host and press Start yourself).
if (process.env.JOIN) {
  for (const b of bots) console.log(b.name, 'join', (await send(b.socket, 'join_room', { code: process.env.JOIN })).ok);
} else {
  await send(bots[0].socket, 'create_room');
  const code = bots[0].room.code;
  for (const b of bots.slice(1)) await send(b.socket, 'join_room', { code });
  await send(bots[0].socket, 'set_settings', { turnSeconds: 60 });
  console.log(`ROOM ${code}  | login: ${DEMO.username} / ${DEMO.password}`);
  await send(bots[0].socket, 'start_game');
}

// Bots chat and react now and then.
const lines = ['gl hf', 'nice one!', 'ha, did not see that coming', 'uno incoming...', 'who is winning?'];
setInterval(() => {
  const b = bots[Math.floor(Math.random() * bots.length)];
  if (Math.random() < 0.5) send(b.socket, 'emote', { emote: ['thumbs', 'laugh', 'wow', 'fire', 'clap', 'party'][Math.floor(Math.random() * 6)] });
  else send(b.socket, 'chat', { text: lines[Math.floor(Math.random() * lines.length)] });
}, 9000);
