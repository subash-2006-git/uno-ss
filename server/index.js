import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import express from 'express';
import compression from 'compression';
import { Server } from 'socket.io';
import * as U from '@uno/shared';
import * as db from './db/index.js';
import * as auth from './auth.js';

const PORT = process.env.PORT || 3001;
const ABSENT_MS = 8000;      // auto-move for a disconnected player after this long
const MAX_MISSED = 3;        // ...and drop them after this many auto-moves in a row
const TURN_CHOICES = [0, 15, 30, 60]; // seconds per turn the host can pick; 0 = no limit
const ROUND_CHOICES = [0, 1, 3, 5, 10]; // match length the host can pick; 0 = play until someone reaches 500
const DEFAULT_SETTINGS = { turnSeconds: 30, rounds: 0 };

const app = express();
app.set('trust proxy', 1); // behind Render's proxy: real client IP for the login lockout
app.use(compression());
app.use(express.json({ limit: '10kb' }));
const server = http.createServer(app);
const io = new Server(server);

const players = new Map(); // id -> { id, name, token, socketId, roomCode }
const rooms = new Map();   // code -> room

/* ---------- helpers ---------- */

// Player entries are created on socket auth; rooms restored from Neon are re-linked here.
function playerFor(user) {
  let p = players.get(user.id);
  if (!p) {
    const room = [...rooms.values()].find((r) => isMember(r, user.id) || isSpectator(r, user.id));
    p = { id: user.id, name: user.username, socketId: null, roomCode: room?.code ?? null };
    players.set(user.id, p);
  }
  p.name = user.username;
  return p;
}

function makeCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (;;) {
    const code = Array.from({ length: 5 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
    if (!rooms.has(code)) return code;
  }
}

const isConnected = (id) => Boolean(players.get(id)?.socketId);
const isMember = (room, id) => room.members.some((m) => m.id === id);
const isSpectator = (room, id) => room.spectators.some((m) => m.id === id);
const everyone = (room) => [...room.members, ...room.spectators];
const MAX_SPECTATORS = 40;
const SPECTATOR_GRACE_MS = 120000; // a disconnected spectator is removed after this long
const CHAT_KEEP = 40;              // messages replayed to someone joining mid-conversation

function roomView(room, pid) {
  return {
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    role: isMember(room, pid) ? 'player' : 'spectator',
    members: room.members.map((m) => ({ id: m.id, name: m.name, connected: isConnected(m.id) })),
    spectators: room.spectators.map((m) => ({ id: m.id, name: m.name, connected: isConnected(m.id), waiting: room.waiting.includes(m.id) })),
    waiting: room.waiting,
    seatsFree: Math.max(0, U.MAX_PLAYERS - room.members.length - room.waiting.length),
    game: room.game ? U.viewFor(room.game, pid) : null, // spectators get an empty hand: they only see public info
    settings: room.settings,
    timer: room.deadline ? { deadline: room.deadline, now: Date.now() } : null, // `now` lets clients correct clock skew
    limits: { min: U.MIN_PLAYERS, max: U.MAX_PLAYERS, target: U.WINNING_SCORE },
  };
}

function emitRoom(room, event, payload) {
  for (const m of everyone(room)) {
    const sid = players.get(m.id)?.socketId;
    if (sid) io.to(sid).emit(event, payload);
  }
}

function broadcast(room) {
  for (const m of everyone(room)) {
    const sid = players.get(m.id)?.socketId;
    if (sid) io.to(sid).emit('room_update', roomView(room, m.id));
  }
}

const sendHistory = (room, p) => { if (p.socketId) io.to(p.socketId).emit('chat_history', room.chat); };

// Called after every state change: record finished matches, persist, re-arm the turn clock, push.
function commit(room) {
  const g = room.game;
  if (g && g.phase === 'matchOver' && !g.recorded) {
    g.recorded = true;
    room.status = 'finished';
    db.recordMatch(room.code, g);
  }
  armTimer(room); // before broadcast so clients receive the fresh deadline
  db.saveRoom(room);
  broadcast(room);
}

function clearClock(room) {
  clearTimeout(room.timer);
  room.timer = null; room.timerKey = null; room.deadline = null;
}

// One clock per pending decision. It only restarts when the decision itself changes
// (different actor / card played / card drawn), so spamming UNO or reconnecting can't stall it.
function armTimer(room) {
  const g = room.game;
  const id = g && room.status === 'playing' ? U.actorId(g) : null;
  if (!id) return clearClock(room);
  const connected = isConnected(id);
  const secs = room.settings.turnSeconds;
  if (connected && !secs) return clearClock(room);

  const key = `${id}|${connected}|${g.phase}|${g.round}|${g.discard.length}|${g.drawnCardId}|${secs}`;
  if (key === room.timerKey && room.timer) return;

  clearTimeout(room.timer);
  const ms = connected ? secs * 1000 : Math.min(ABSENT_MS, secs ? secs * 1000 : ABSENT_MS);
  room.timerKey = key;
  room.deadline = Date.now() + ms;
  room.timer = setTimeout(() => {
    room.timer = null; room.timerKey = null;
    const cur = room.game;
    if (!cur || room.status !== 'playing' || U.actorId(cur) !== id) return;
    room.missed[id] = (room.missed[id] ?? 0) + 1;
    if (room.missed[id] >= MAX_MISSED) dropMember(room, id, 'Removed from the game for being inactive');
    else { U.autoMove(cur, id); commit(room); }
  }, ms);
}

function dropMember(room, id, kickMessage) {
  const p = players.get(id);
  if (kickMessage && p?.socketId) io.to(p.socketId).emit('kicked', { message: kickMessage });
  if (p && p.roomCode === room.code) p.roomCode = null;
  room.members = room.members.filter((m) => m.id !== id);
  if (room.game && room.status === 'playing') U.removePlayer(room.game, id);
  if (!room.members.length) {
    for (const s of room.spectators) { // nobody left to watch
      const sp = players.get(s.id);
      if (sp?.socketId) io.to(sp.socketId).emit('kicked', { message: 'The game ended because all players left' });
      if (sp) sp.roomCode = null;
    }
    clearClock(room);
    rooms.delete(room.code);
    db.deleteRoom(room.code);
    return;
  }
  if (room.hostId === id) {
    room.hostId = (room.members.find((m) => isConnected(m.id)) ?? room.members[0]).id;
  }
  commit(room);
}

function removeSpectator(room, id, kickMessage) {
  const p = players.get(id);
  if (kickMessage && p?.socketId) io.to(p.socketId).emit('kicked', { message: kickMessage });
  if (p && p.roomCode === room.code) p.roomCode = null;
  room.spectators = room.spectators.filter((s) => s.id !== id);
  room.waiting = room.waiting.filter((x) => x !== id);
  commit(room);
}

const leaveRoom = (room, id, msg) => (isMember(room, id) ? dropMember(room, id, msg) : removeSpectator(room, id, msg));

function scheduleSpectatorPrune(room, id) {
  setTimeout(() => {
    const r = rooms.get(room.code);
    if (r && isSpectator(r, id) && !isConnected(id)) removeSpectator(r, id);
  }, SPECTATOR_GRACE_MS);
}

// Spectators who asked for a seat are dealt in at the start of the next round.
function admitWaiting(room) {
  const g = room.game;
  for (const id of [...room.waiting]) {
    room.waiting = room.waiting.filter((x) => x !== id);
    const s = room.spectators.find((x) => x.id === id);
    if (!s || !g || room.members.length >= U.MAX_PLAYERS) continue;
    if (U.addPlayer(g, s).ok) {
      room.members.push({ id: s.id, name: s.name });
      room.spectators = room.spectators.filter((x) => x.id !== id);
    }
  }
}

function newRoom(code, host) {
  return {
    code, hostId: host.id, status: 'lobby', members: [{ id: host.id, name: host.name }], spectators: [], waiting: [], chat: [],
    game: null, timer: null, timerKey: null, deadline: null, missed: {}, settings: { ...DEFAULT_SETTINGS },
  };
}

const roomOf = (p) => (p.roomCode ? rooms.get(p.roomCode) : null);

/* ---------- sockets ---------- */

io.on('connection', (socket) => {
  let me = null;

  // Wrap a handler: requires auth, passes (player, room, payload), replies via ack.
  const on = (event, { needRoom = true } = {}, fn) => socket.on(event, (payload, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    try {
      if (!me) return reply({ ok: false, error: 'Not signed in' });
      const room = roomOf(me);
      if (needRoom && !room) return reply({ ok: false, error: 'You are not in a room' });
      reply(fn(me, room, payload ?? {}) ?? { ok: true });
    } catch (e) {
      console.error(event, e);
      reply({ ok: false, error: 'Server error' });
    }
  });

  // Sockets sign in with the session token from /api/login. Only approved users get in.
  socket.on('auth', async (payload, ack) => {
    try {
      const user = await userFromToken(payload?.token);
      if (!user) return ack?.({ ok: false, error: 'Please log in again' });
      if (user.status !== 'approved') return ack?.({ ok: false, error: 'Account not approved' });
      const p = playerFor(user);
      if (p.socketId && p.socketId !== socket.id) io.sockets.sockets.get(p.socketId)?.disconnect(true); // one device at a time
      me = p;
      p.socketId = socket.id;
      ack?.({ ok: true, name: p.name });
      const room = roomOf(p);
      if (room) { room.missed[p.id] = 0; commit(room); sendHistory(room, p); }
    } catch (e) {
      console.error('auth', e);
      ack?.({ ok: false, error: 'Server error' });
    }
  });

  on('create_room', { needRoom: false }, (p) => {
    const old = roomOf(p);
    if (old) leaveRoom(old, p.id);
    const room = newRoom(makeCode(), p);
    rooms.set(room.code, room);
    p.roomCode = room.code;
    commit(room);
  });

  // Joining a lobby seats you as a player. Joining a game in progress makes you a spectator
  // (who can then ask for a seat in the next round).
  on('join_room', { needRoom: false }, (p, _r, { code }) => {
    const room = rooms.get(String(code ?? '').toUpperCase().trim());
    if (!room) return { ok: false, error: 'Room not found' };
    if (isMember(room, p.id) || isSpectator(room, p.id)) {
      p.roomCode = room.code; commit(room); sendHistory(room, p);
      return { ok: true, role: isMember(room, p.id) ? 'player' : 'spectator' };
    }
    const asPlayer = room.status === 'lobby';
    if (asPlayer && room.members.length >= U.MAX_PLAYERS) return { ok: false, error: `Room is full (${U.MAX_PLAYERS} max)` };
    if (!asPlayer && room.spectators.length >= MAX_SPECTATORS) return { ok: false, error: 'Too many spectators in that room' };
    const old = roomOf(p);
    if (old) leaveRoom(old, p.id);
    (asPlayer ? room.members : room.spectators).push({ id: p.id, name: p.name });
    p.roomCode = room.code;
    commit(room);
    sendHistory(room, p);
    return { ok: true, role: asPlayer ? 'player' : 'spectator' };
  });

  on('leave_room', {}, (p, room) => { leaveRoom(room, p.id); });

  // Spectator -> player. In a lobby: sit down now. In a game: queue for the next round.
  on('request_seat', {}, (p, room) => {
    if (!isSpectator(room, p.id)) return { ok: false, error: 'You are already playing' };
    if (room.waiting.includes(p.id)) return { ok: true };
    if (room.members.length + room.waiting.length >= U.MAX_PLAYERS) return { ok: false, error: 'No free seats' };
    if (room.status === 'lobby') {
      room.spectators = room.spectators.filter((s) => s.id !== p.id);
      room.members.push({ id: p.id, name: p.name });
    } else room.waiting.push(p.id);
    commit(room);
  });

  on('cancel_seat', {}, (p, room) => {
    room.waiting = room.waiting.filter((x) => x !== p.id);
    commit(room);
  });

  const nowMs = () => Date.now();
  const say = (p, room, kind, extra) => ({
    id: randomUUID().slice(0, 8), pid: p.id, name: p.name, spectator: !isMember(room, p.id), kind, at: nowMs(), ...extra,
  });

  on('chat', {}, (p, room, { text }) => {
    if (nowMs() - (p.lastChat ?? 0) < 700) return { ok: false, error: 'Slow down a little' };
    const clean = String(text ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!clean) return { ok: false, error: 'Type a message first' };
    p.lastChat = nowMs();
    const msg = say(p, room, 'text', { text: clean });
    room.chat.push(msg);
    if (room.chat.length > CHAT_KEEP) room.chat.shift();
    emitRoom(room, 'chat_msg', msg);
  });

  on('emote', {}, (p, room, { emote }) => {
    if (!U.EMOTE_IDS.includes(emote)) return { ok: false, error: 'Unknown emote' };
    if (nowMs() - (p.lastEmote ?? 0) < 1200) return { ok: false, error: 'Slow down a little' };
    p.lastEmote = nowMs();
    emitRoom(room, 'chat_msg', say(p, room, 'emote', { emote }));
  });

  // Either setting can be sent on its own; both are validated before anything is applied.
  on('set_settings', {}, (p, room, { turnSeconds, rounds }) => {
    if (room.hostId !== p.id) return { ok: false, error: 'Only the host can change settings' };
    if (room.status !== 'lobby') return { ok: false, error: 'Settings are locked once the game starts' };
    if (turnSeconds === undefined && rounds === undefined) return { ok: false, error: 'Nothing to change' };
    if (turnSeconds !== undefined && !TURN_CHOICES.includes(turnSeconds)) return { ok: false, error: 'Invalid turn time' };
    if (rounds !== undefined && !ROUND_CHOICES.includes(rounds)) return { ok: false, error: 'Invalid number of rounds' };
    if (turnSeconds !== undefined) room.settings.turnSeconds = turnSeconds;
    if (rounds !== undefined) room.settings.rounds = rounds;
    commit(room);
  });

  // Latency probe used by the client's connection indicator.
  socket.on('ping_check', (_p, ack) => { if (typeof ack === 'function') ack(); });

  on('start_game', {}, (p, room) => {
    if (room.hostId !== p.id) return { ok: false, error: 'Only the host can start' };
    if (room.status !== 'lobby') return { ok: false, error: 'Already started' };
    if (room.members.length < U.MIN_PLAYERS) return { ok: false, error: `Need at least ${U.MIN_PLAYERS} players` };
    room.game = U.createGame(room.members, Math.random, { maxRounds: room.settings.rounds });
    room.status = 'playing';
    room.missed = {};
    commit(room);
  });

  // Game moves share one shape: run the engine function, push on success.
  const move = (event, run) => on(event, {}, (p, room, payload) => {
    if (room.status !== 'playing' || !room.game) return { ok: false, error: 'No game in progress' };
    if (!isMember(room, p.id)) return { ok: false, error: 'Spectators cannot play' };
    const wasActor = U.actorId(room.game) === p.id;
    const r = run(room.game, p.id, payload);
    if (r.ok) { if (wasActor) room.missed[p.id] = 0; commit(room); }
    return r;
  });

  move('play_card', (g, id, { cardId, color }) => U.playCard(g, id, cardId, color));
  move('draw_card', (g, id) => U.drawCard(g, id));
  move('pass_turn', (g, id) => U.passTurn(g, id));
  move('challenge', (g, id, { accept }) => U.resolveChallenge(g, id, !accept));
  move('call_uno', (g, id) => U.callUno(g, id));
  move('catch_uno', (g, id) => U.catchUno(g, id));

  on('next_round', {}, (p, room) => {
    if (room.status !== 'playing' || !room.game) return { ok: false, error: 'No game in progress' };
    if (!isMember(room, p.id)) return { ok: false, error: 'Only players can start the next round' };
    if (room.game.phase !== 'roundOver') return { ok: false, error: 'Round is not over' };
    admitWaiting(room); // late joiners are dealt in with everyone else
    const r = U.nextRound(room.game);
    if (r.ok) commit(room);
    return r;
  });

  on('rematch', {}, (p, room) => {
    if (room.hostId !== p.id) return { ok: false, error: 'Only the host can restart' };
    if (room.status !== 'finished') return { ok: false, error: 'Match is not over' };
    room.game = null;
    room.status = 'lobby';
    for (const id of room.waiting) { // spectators who asked for a seat sit down first
      const s = room.spectators.find((x) => x.id === id);
      if (s && room.members.length < U.MAX_PLAYERS) {
        room.members.push({ id: s.id, name: s.name });
        room.spectators = room.spectators.filter((x) => x.id !== id);
      }
    }
    room.waiting = [];
    commit(room);
  });

  socket.on('disconnect', () => {
    if (!me || me.socketId !== socket.id) return;
    me.socketId = null;
    const room = roomOf(me);
    if (!room) return;
    if (isSpectator(room, me.id)) scheduleSpectatorPrune(room, me.id);
    commit(room);
  });
});

/* ---------- accounts (http) ---------- */

const publicUser = (u) => ({ id: u.id, username: u.username, status: u.status, isAdmin: u.isAdmin, createdAt: u.createdAt });

async function userFromToken(token) {
  if (!token || typeof token !== 'string') return null;
  const id = await db.getSessionUserId(auth.hashToken(token));
  return id ? db.getUserById(id) : null;
}

const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
  console.error(req.path, e);
  res.status(500).json({ error: 'Server error' });
});

const bearer = (req) => (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');

async function adminOnly(req, res) {
  const u = await userFromToken(bearer(req));
  if (!u || u.status !== 'approved' || !u.isAdmin) { res.status(403).json({ error: 'Admins only' }); return null; }
  return u;
}

app.post('/api/signup', wrap(async (req, res) => {
  const { username, password } = req.body ?? {};
  const bad = auth.validateUsername(username) || auth.validatePassword(password);
  if (bad) return res.status(400).json({ error: bad });
  const user = await db.createUser({ id: randomUUID(), username, hash: await auth.hashPassword(password) });
  if (!user) return res.status(409).json({ error: 'That username is taken' });
  res.status(201).json({ ok: true, status: 'pending' });
}));

app.post('/api/login', wrap(async (req, res) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== 'string' || typeof password !== 'string') return res.status(400).json({ error: 'Enter username and password' });
  const key = `${req.ip}|${username.toLowerCase()}`;
  if (auth.isLockedOut(key)) return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
  const user = await db.getUserByName(username);
  if (!user || !(await auth.verifyPassword(password, user.hash))) {
    auth.noteFailure(key);
    return res.status(401).json({ error: 'Wrong username or password' });
  }
  auth.clearFailures(key);
  if (user.status === 'pending') return res.status(403).json({ status: 'pending', error: 'Your account is waiting for admin approval.' });
  if (user.status === 'rejected') return res.status(403).json({ status: 'rejected', error: 'Your account request was declined.' });
  const token = auth.newToken();
  await db.createSession(auth.hashToken(token), user.id);
  res.json({ token, user: publicUser(user) });
}));

app.get('/api/me', wrap(async (req, res) => {
  const u = await userFromToken(bearer(req));
  if (!u || u.status !== 'approved') return res.status(401).json({ error: 'Not logged in' });
  res.json({ user: publicUser(u) });
}));

app.post('/api/logout', wrap(async (req, res) => {
  const t = bearer(req);
  if (t) await db.deleteSession(auth.hashToken(t));
  res.json({ ok: true });
}));

/* ---------- admin (http) ---------- */

app.get('/api/admin/users', wrap(async (req, res) => {
  if (!(await adminOnly(req, res))) return;
  res.json({ users: (await db.listUsers()).map(publicUser) });
}));

app.post('/api/admin/users/:id/:action', wrap(async (req, res) => {
  const admin = await adminOnly(req, res);
  if (!admin) return;
  const target = await db.getUserById(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  const { action } = req.params;

  if (action === 'approve') {
    await db.updateUser(target.id, { status: 'approved' });
  } else if (action === 'reject') {
    if (target.isAdmin) return res.status(400).json({ error: 'Cannot reject an admin' });
    await db.updateUser(target.id, { status: 'rejected' });
    await db.deleteUserSessions(target.id);
  } else if (action === 'reset-password') {
    const bad = auth.validatePassword(req.body?.password);
    if (bad) return res.status(400).json({ error: bad });
    await db.updateUser(target.id, { hash: await auth.hashPassword(req.body.password) });
    await db.deleteUserSessions(target.id); // force re-login everywhere
  } else return res.status(404).json({ error: 'Unknown action' });

  res.json({ ok: true, user: publicUser(await db.getUserById(target.id)) });
}));

// The admin account comes from .env and is re-synced on every start.
async function seedAdmin() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) return console.log('[auth] ADMIN_USERNAME/ADMIN_PASSWORD not set: nobody can approve accounts');
  const bad = auth.validateUsername(username) || auth.validatePassword(password);
  if (bad) return console.error('[auth] invalid admin credentials in .env:', bad);
  const existing = await db.getUserByName(username);
  if (!existing) {
    await db.createUser({ id: randomUUID(), username, hash: await auth.hashPassword(password), status: 'approved', isAdmin: true });
    return console.log(`[auth] admin "${username}" created`);
  }
  const fix = { status: 'approved', isAdmin: true };
  if (!(await auth.verifyPassword(password, existing.hash))) fix.hash = await auth.hashPassword(password);
  await db.updateUser(existing.id, fix);
  console.log(`[auth] admin "${username}" ready`);
}

/* ---------- http ---------- */

app.get('/api/leaderboard', async (_req, res) => res.json((await db.leaderboard()) ?? []));
app.get('/api/stats/me', wrap(async (req, res) => {
  const u = await userFromToken(bearer(req));
  if (!u || u.status !== 'approved') return res.status(401).json({ error: 'Not logged in' });
  res.json(await db.userStats(u.id));
}));
app.get('/api/health', (_req, res) => res.json({ ok: true, db: db.dbEnabled, rooms: rooms.size }));

const dist = path.resolve(import.meta.dirname, '../client/dist');
if (fs.existsSync(dist)) {
  // Hashed build files never change, so browsers can cache them for a year (big win on slow networks).
  app.use('/assets', express.static(path.join(dist, 'assets'), { maxAge: '365d', immutable: true }));
  app.use(express.static(dist));
  app.get(/^(?!\/api|\/socket\.io).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

/* ---------- boot ---------- */

async function restore() {
  for (const r of (await db.loadRooms()) ?? []) {
    const room = {
      code: r.code, hostId: r.host_id, status: r.status,
      members: r.data.members ?? [], game: r.data.game ?? null, missed: {},
      spectators: r.data.spectators ?? [], waiting: r.data.waiting ?? [], chat: [],
      timer: null, timerKey: null, deadline: null,
      settings: { ...DEFAULT_SETTINGS, ...(r.data.settings ?? {}) },
    };
    if (room.status === 'finished' || !room.members.length) continue;
    rooms.set(room.code, room);
    for (const s of room.spectators) scheduleSpectatorPrune(room, s.id); // nobody is connected right after a restart
    armTimer(room);
  }
  if (rooms.size) console.log(`[db] restored ${rooms.size} room(s)`);
}

await db.initDb().catch((e) => console.error('[db] init failed, continuing in-memory:', e.message));
await seedAdmin();
await restore();
server.listen(PORT, () => console.log(`UNO server on http://localhost:${PORT}`));
