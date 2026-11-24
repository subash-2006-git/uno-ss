// End-to-end test against a running server. Start it with admin credentials:
//   ADMIN_USERNAME=admin ADMIN_PASSWORD=adminpass123 node server/index.js
// Covers: signup -> pending -> admin approval -> login -> room -> full round -> reconnect,
// plus rejection, admin-only routes and password reset.
import { io } from 'socket.io-client';
import { isPlayable } from '../shared/uno.js';

const URL = process.env.URL || 'http://localhost:3001';
const ADMIN = { username: process.env.ADMIN_USERNAME || 'admin', password: process.env.ADMIN_PASSWORD || 'adminpass123' };
const N = 4;
const run = Date.now().toString(36).slice(-5);
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } };

const http = async (path, { method = 'GET', body, token } = {}) => {
  const res = await fetch(URL + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { ...(await res.json().catch(() => ({}))), status: res.status };
};
const send = (s, ev, p) => new Promise((r) => s.emit(ev, p ?? {}, r));

/* ---- accounts ---- */
const admin = await http('/api/login', { method: 'POST', body: ADMIN });
assert(admin.status === 200 && admin.user.isAdmin, 'admin can log in');

const pw = 'secret-pass-1';
const names = Array.from({ length: N }, (_, i) => `p${i}_${run}`);
for (const username of names) assert((await http('/api/signup', { method: 'POST', body: { username, password: pw } })).status === 201, 'signup');
assert((await http('/api/signup', { method: 'POST', body: { username: names[0], password: pw } })).status === 409, 'duplicate username rejected');
assert((await http('/api/signup', { method: 'POST', body: { username: 'ab', password: pw } })).status === 400, 'short username rejected');
assert((await http('/api/signup', { method: 'POST', body: { username: 'okname_' + run, password: 'short' } })).status === 400, 'short password rejected');

const pending = await http('/api/login', { method: 'POST', body: { username: names[0], password: pw } });
assert(pending.status === 403 && pending.status !== 200 && !pending.token, 'pending user cannot log in');
assert((await http('/api/login', { method: 'POST', body: { username: names[0], password: 'wrong-pass-9' } })).status === 401, 'wrong password rejected');

const list = (await http('/api/admin/users', { token: admin.token })).users;
const byName = Object.fromEntries(list.map((u) => [u.username, u]));
assert(names.every((n) => byName[n]?.status === 'pending'), 'new users listed as pending');

// a non-admin must not reach admin routes (use a freshly approved user)
const approve = (n) => http(`/api/admin/users/${byName[n].id}/approve`, { method: 'POST', token: admin.token });
assert((await approve(names[0])).status === 200, 'admin approves');
const u0 = await http('/api/login', { method: 'POST', body: { username: names[0], password: pw } });
assert(u0.status === 200, 'approved user can log in');
assert((await http('/api/admin/users', { token: u0.token })).status === 403, 'non-admin blocked from admin list');
assert((await http(`/api/admin/users/${byName[names[1]].id}/approve`, { method: 'POST', token: u0.token })).status === 403, 'non-admin cannot approve');
assert((await http('/api/admin/users')).status === 403, 'anonymous blocked from admin list');

// reject then re-approve someone
assert((await http(`/api/admin/users/${byName[names[1]].id}/reject`, { method: 'POST', token: admin.token })).status === 200, 'reject');
const rej = await http('/api/login', { method: 'POST', body: { username: names[1], password: pw } });
assert(rej.status === 403 && rej.status === 403 && !rej.token, 'rejected user cannot log in');
for (const n of names.slice(1)) assert((await approve(n)).status === 200, 'approve ' + n);

// password reset kills old sessions and changes the password
const newPw = 'brand-new-pass-2';
assert((await http(`/api/admin/users/${byName[names[3]].id}/reset-password`, { method: 'POST', token: admin.token, body: { password: 'x' } })).status === 400, 'weak reset rejected');
const t3old = (await http('/api/login', { method: 'POST', body: { username: names[3], password: pw } })).token;
assert(t3old, 'login before reset');
assert((await http(`/api/admin/users/${byName[names[3]].id}/reset-password`, { method: 'POST', token: admin.token, body: { password: newPw } })).status === 200, 'reset');
assert((await http('/api/me', { token: t3old })).status === 401, 'old session invalid after reset');
assert((await http('/api/login', { method: 'POST', body: { username: names[3], password: pw } })).status === 401, 'old password no longer works');

/* ---- gameplay ---- */
const clients = [];
for (let i = 0; i < N; i++) {
  const login = await http('/api/login', { method: 'POST', body: { username: names[i], password: i === 3 ? newPw : pw } });
  assert(login.status === 200, 'login ' + names[i]);
  const socket = io(URL, { forceNew: true });
  await new Promise((r) => socket.on('connect', r));
  const c = { socket, id: login.user.id, token: login.token, room: null };
  socket.on('room_update', (r) => { c.room = r; });
  assert((await send(socket, 'auth', { token: c.token })).ok, 'socket auth');
  clients.push(c);
}
const anon = io(URL, { forceNew: true });
await new Promise((r) => anon.on('connect', r));
assert(!(await send(anon, 'create_room')).ok, 'unauthenticated socket cannot create room');
assert(!(await send(anon, 'auth', { token: 'nope' })).ok, 'bad token rejected');
anon.disconnect();

assert((await send(clients[0].socket, 'create_room')).ok, 'create');
const code = clients[0].room.code;
for (const c of clients.slice(1)) assert((await send(c.socket, 'join_room', { code })).ok, 'join');
assert(!(await send(clients[1].socket, 'start_game')).ok, 'non-host cannot start');
// turn-timer settings: host only, validated values, visible to everyone
assert(!(await send(clients[1].socket, 'set_settings', { turnSeconds: 15 })).ok, 'non-host cannot change settings');
assert(!(await send(clients[0].socket, 'set_settings', { turnSeconds: 7 })).ok, 'invalid turn time rejected');
assert((await send(clients[0].socket, 'set_settings', { turnSeconds: 15 })).ok, 'host sets 15s timer');
await new Promise((r) => setTimeout(r, 100));
assert(clients.every((c) => c.room.settings.turnSeconds === 15), 'settings broadcast to all');
// match length: host only, validated, independent of the turn timer, shown to everyone
assert(clients.every((c) => c.room.settings.rounds === 0), 'default is first to 500');
assert(!(await send(clients[1].socket, 'set_settings', { rounds: 3 })).ok, 'non-host cannot change match length');
assert(!(await send(clients[0].socket, 'set_settings', { rounds: 2 })).ok, 'invalid round count rejected');
assert(!(await send(clients[0].socket, 'set_settings', { rounds: 3, turnSeconds: 7 })).ok, 'bad value rejects the whole change');
assert(clients[0].room.settings.rounds === 0, 'nothing applied after a rejected change');
assert(!(await send(clients[0].socket, 'set_settings', {})).ok, 'empty settings change rejected');
assert((await send(clients[0].socket, 'set_settings', { rounds: 3 })).ok, 'host sets 3 rounds');
await new Promise((r) => setTimeout(r, 100));
assert(clients.every((c) => c.room.settings.rounds === 3 && c.room.settings.turnSeconds === 15), 'rounds broadcast, turn timer untouched');
assert((await send(clients[0].socket, 'set_settings', { rounds: 0 })).ok, 'host switches back to first to 500');
await new Promise((r) => setTimeout(r, 100));
assert((await send(clients[0].socket, 'start_game')).ok, 'start');
await new Promise((r) => setTimeout(r, 100));

// the clock runs for the player to move, and survives unrelated updates (no reset exploits)
{
  const v = clients[0].room.game;
  const actor = clients.find((x) => x.id === v.turn);
  const spectator = clients.find((x) => x.id !== v.turn);
  const t1 = actor.room.timer;
  assert(t1 && t1.deadline - t1.now > 13000 && t1.deadline - t1.now <= 15000, 'timer armed for ~15s');
  spectator.socket.disconnect();
  await new Promise((r) => setTimeout(r, 150));
  spectator.socket.connect();
  await new Promise((r) => spectator.socket.once('connect', r));
  assert((await send(spectator.socket, 'auth', { token: spectator.token })).ok, 'spectator reauth');
  await new Promise((r) => setTimeout(r, 150));
  assert(actor.room.timer.deadline === t1.deadline, 'deadline unchanged by unrelated updates');

  // nobody acts: the server must move for the actor when time is up
  const handBefore = actor.room.game.hand.length;
  const waitUntil = Date.now() + 18000;
  while (Date.now() < waitUntil && clients[0].room.game.turn === actor.id) await new Promise((r) => setTimeout(r, 200));
  assert(clients[0].room.game.turn !== actor.id, 'turn passed on timeout');
  assert(actor.room.game.hand.length === handBefore + 1, 'timed-out player drew a card');
  console.log('timer: auto-move on timeout ok');
}

/* ---- spectators, late joiners, chat ---- */
const specName = `spec_${run}`;
assert((await http('/api/signup', { method: 'POST', body: { username: specName, password: pw } })).status === 201, 'spectator signup');
const specId = (await http('/api/admin/users', { token: admin.token })).users.find((u) => u.username === specName).id;
assert((await http(`/api/admin/users/${specId}/approve`, { method: 'POST', token: admin.token })).status === 200, 'approve spectator');
const specLogin = await http('/api/login', { method: 'POST', body: { username: specName, password: pw } });
const spec = { socket: io(URL, { forceNew: true }), id: specId, token: specLogin.token, room: null, chat: [], history: null };
await new Promise((r) => spec.socket.on('connect', r));
spec.socket.on('room_update', (r) => { spec.room = r; });
spec.socket.on('chat_msg', (m) => spec.chat.push(m));
spec.socket.on('chat_history', (h) => { spec.history = h; });
clients.forEach((c) => { c.chat = []; c.socket.on('chat_msg', (m) => c.chat.push(m)); });
assert((await send(spec.socket, 'auth', { token: spec.token })).ok, 'spectator auth');

const joined = await send(spec.socket, 'join_room', { code });
assert(joined.ok && joined.role === 'spectator', 'joining a running game makes you a spectator');
await new Promise((r) => setTimeout(r, 150));
assert(spec.room.role === 'spectator' && spec.room.game.hand.length === 0, 'spectator sees no hand');
assert(!JSON.stringify(spec.room).includes('"hand":[{'), 'no hands leaked to spectator');
assert(clients[0].room.spectators.some((s) => s.id === specId), 'players see the spectator');
for (const [ev, payload] of [['play_card', { cardId: 1, color: 'red' }], ['draw_card'], ['call_uno'], ['catch_uno'], ['next_round'], ['challenge', { accept: true }], ['start_game'], ['rematch']]) {
  assert(!(await send(spec.socket, ev, payload)).ok, `spectator cannot ${ev}`);
}

// chat: delivery to everyone, rate limit, validation, history on reconnect
assert((await send(spec.socket, 'chat', { text: '  hello   table  ' })).ok, 'spectator can chat');
assert(!(await send(spec.socket, 'chat', { text: 'again too fast' })).ok, 'chat rate limit');
assert(!(await send(clients[1].socket, 'chat', { text: '   ' })).ok, 'empty chat rejected');
assert((await send(clients[1].socket, 'chat', { text: 'x'.repeat(500) })).ok, 'long chat accepted but trimmed');
assert(!(await send(clients[2].socket, 'emote', { emote: 'rm -rf' })).ok, 'unknown emote rejected');
assert((await send(clients[2].socket, 'emote', { emote: 'fire' })).ok, 'emote accepted');
await new Promise((r) => setTimeout(r, 150));
assert(clients.every((c) => c.chat.some((m) => m.text === 'hello table' && m.spectator)), 'chat reaches all players, whitespace cleaned, spectator tagged');
assert(clients.every((c) => c.chat.some((m) => m.kind === 'emote' && m.emote === 'fire')), 'emote reaches all players');
assert(spec.chat.some((m) => m.text?.length === 120), 'long message trimmed to 120');
spec.socket.disconnect();
await new Promise((r) => setTimeout(r, 100));
spec.socket.connect();
await new Promise((r) => spec.socket.once('connect', r));
assert((await send(spec.socket, 'auth', { token: spec.token })).ok, 'spectator reauth');
await new Promise((r) => setTimeout(r, 150));
assert(spec.room?.role === 'spectator' && spec.history?.some((m) => m.text === 'hello table'), 'spectator keeps place and gets chat history after reconnect');

assert((await send(spec.socket, 'request_seat')).ok, 'spectator asks for a seat');
await new Promise((r) => setTimeout(r, 100));
assert(spec.room.waiting.includes(specId) && clients[0].room.waiting.includes(specId), 'seat request visible to everyone');
console.log('spectators + chat ok');

for (const c of clients) {
  assert(c.room.game.hand.length >= 7, 'own hand dealt');
  assert(!JSON.stringify(c.room.game.players).includes('"hand"'), 'hands leaked in player list');
}

let reconnected = false;
for (let step = 0; step < 3000; step++) {
  await new Promise((r) => setTimeout(r, 5));
  const v = clients[0].room.game;
  if (v.phase === 'roundOver' || v.phase === 'matchOver') break;
  const actorId = v.phase === 'challenge' ? v.pending.challenger : v.turn;
  const c = clients.find((x) => x.id === actorId);
  const g = c.room.game;
  if (g.phase === 'challenge') { await send(c.socket, 'challenge', { accept: Math.random() < 0.5 }); continue; }
  const playable = g.hand.filter((x) => isPlayable(x, g.top, g.color) && (g.drawnCardId == null || x.id === g.drawnCardId));
  if (playable.length) await send(c.socket, 'play_card', { cardId: playable[0].id, color: 'red' });
  else if (g.drawnCardId != null) await send(c.socket, 'pass_turn');
  else await send(c.socket, 'draw_card');

  if (step === 20 && !reconnected) {
    const d = clients[3];
    d.socket.disconnect();
    await new Promise((r) => setTimeout(r, 100));
    d.socket.connect();
    await new Promise((r) => d.socket.once('connect', r));
    assert((await send(d.socket, 'auth', { token: d.token })).ok, 'reauth');
    await new Promise((r) => setTimeout(r, 100));
    assert(d.room?.game?.hand.length > 0, 'state restored after reconnect');
    reconnected = true;
  }
}
const end = clients[0].room.game;
assert(end.phase === 'roundOver' || end.phase === 'matchOver', 'round finished');
assert(end.roundResult.points > 0, 'points awarded');

// late joiner is dealt in when the next round starts
if (end.phase === 'roundOver') {
  assert(!(await send(spec.socket, 'next_round')).ok, 'spectator cannot start the next round');
  assert((await send(clients[0].socket, 'next_round')).ok, 'player starts next round');
  await new Promise((r) => setTimeout(r, 200));
  assert(spec.room.role === 'player' && spec.room.waiting.length === 0, 'late joiner became a player');
  assert(spec.room.game.players.length === 5 && spec.room.game.hand.length >= 7 && spec.room.game.hand.length <= 9, 'late joiner dealt in (7 cards, +2 if a Draw Two started the round)');
  assert(spec.room.game.players.find((p) => p.id === specId).score === 0, 'late joiner starts at 0');
  assert(clients[0].room.members.length === 5 && clients[0].room.spectators.length === 0, 'room lists updated');
  console.log('late joiner seated at next round ok');
}
spec.socket.disconnect();

/* ================= bots, seat holding + rejoin, admin tools, profiles, abuse limits ================= */
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function mk(prefix) {
  const username = `${prefix}_${run}`;
  assert((await http('/api/signup', { method: 'POST', body: { username, password: pw } })).status === 201, 'signup ' + username);
  const uid = (await http('/api/admin/users', { token: admin.token })).users.find((u) => u.username === username).id;
  assert((await http(`/api/admin/users/${uid}/approve`, { method: 'POST', token: admin.token })).status === 200, 'approve ' + username);
  const login = await http('/api/login', { method: 'POST', body: { username, password: pw } });
  const socket = io(URL, { forceNew: true });
  await new Promise((r) => socket.on('connect', r));
  const c = { username, id: uid, token: login.token, socket, room: null, rejoin: undefined, suspended: null };
  socket.on('room_update', (r) => { c.room = r; });
  socket.on('rejoin_info', (i) => { c.rejoin = i.code; });
  socket.on('suspended', (m) => { c.suspended = m; });
  assert((await send(socket, 'auth', { token: c.token })).ok, 'auth ' + username);
  return c;
}
// One reasonable move for a human client whose turn it is.
async function playOne(c) {
  const g = c.room?.game;
  if (!g) return;
  const mover = g.phase === 'challenge' ? g.pending?.challenger : g.phase === 'play' ? g.turn : null;
  if (mover !== c.id) return;
  if (g.phase === 'challenge') return send(c.socket, 'challenge', { accept: true });
  const ok = g.hand.filter((x) => isPlayable(x, g.top, g.color) && (g.drawnCardId == null || x.id === g.drawnCardId));
  if (ok.length) return send(c.socket, 'play_card', { cardId: ok[0].id, color: 'blue' });
  return send(c.socket, g.drawnCardId != null ? 'pass_turn' : 'draw_card');
}

// admins hear about new sign-ups live
const adminSock = io(URL, { forceNew: true });
await new Promise((r) => adminSock.on('connect', r));
const pendingEvents = [];
adminSock.on('admin_pending', (e) => pendingEvents.push(e));
assert((await send(adminSock, 'auth', { token: admin.token })).ok, 'admin socket auth');
const PN = await mk('pn');
await wait(200);
assert(pendingEvents.some((e) => e.newUser === PN.username), 'admin is told about the new sign-up');

// bots in the lobby
const H = await mk('bh');
const R = await mk('br');
assert((await send(H.socket, 'create_room')).ok, 'bot host creates room');
const bcode = H.room.code;
assert((await send(R.socket, 'join_room', { code: bcode })).ok, 'second human joins');
assert(!(await send(R.socket, 'add_bot')).ok, 'non-host cannot add bots');
assert((await send(H.socket, 'add_bot')).ok, 'host adds a bot');
await wait(100);
const botMember = H.room.members.find((m) => m.bot);
assert(botMember && botMember.id.startsWith('bot-') && botMember.connected, 'bot is listed and always "connected"');
assert(!(await send(R.socket, 'remove_bot', { id: botMember.id })).ok, 'non-host cannot remove bots');
assert((await send(H.socket, 'remove_bot', { id: botMember.id })).ok, 'host removes the bot');
await wait(100);
assert(!H.room.members.some((m) => m.bot), 'bot gone');
assert((await send(H.socket, 'add_bot')).ok, 'host adds a bot again');
assert((await send(H.socket, 'start_game')).ok, 'game starts with humans and a bot');
await wait(150);
const botName = H.room.members.find((m) => m.bot).name;
assert(H.room.game.players.some((p) => p.bot && p.name === botName), 'bot seated in the game');

// the bot actually plays its own turns
let botActed = false;
for (let i = 0; i < 400 && !botActed; i++) {
  await playOne(H); await playOne(R);
  await wait(30);
  botActed = H.room.game.log.some((l) => l.startsWith(botName) && /played|drew/.test(l));
}
assert(botActed, 'the bot plays by itself');

// leaving a running game: a bot takes the seat, and the player can take it back
await send(H.socket, 'leave_room');
await wait(250);
assert(H.rejoin === bcode, 'the leaver is offered a way back');
assert(R.room.game.players.find((p) => p.id === H.id).bot === true, 'a bot plays the leaver\'s seat');
assert(R.room.members.find((m) => m.id === H.id)?.away === true, 'seat is marked away');
assert(R.room.hostId === R.id, 'host passes to the remaining human');
const back = await send(H.socket, 'join_room', { code: bcode });
assert(back.ok && back.rejoined && back.role === 'player', 'rejoining takes the seat back');
await wait(250);
assert(H.room.game.players.find((p) => p.id === H.id).bot === false && H.room.game.hand.length > 0, 'seat reclaimed with a hand');
// when the last humans leave, there is no game left to hold a seat in
await send(H.socket, 'leave_room'); await send(R.socket, 'leave_room');
await wait(250);
assert((await send(H.socket, 'join_room', { code: bcode })).error === 'Room not found', 'room closes once every human has left');

// admin tools: suspend / reinstate
const SP = await mk('sp');
const adminId = (await http('/api/admin/users', { token: admin.token })).users.find((u) => u.isAdmin).id;
assert((await http(`/api/admin/users/${adminId}/suspend`, { method: 'POST', token: admin.token })).status === 400, 'admins cannot be suspended');
assert((await http(`/api/admin/users/${SP.id}/reinstate`, { method: 'POST', token: admin.token })).status === 400, 'cannot reinstate someone who is not suspended');
assert((await send(SP.socket, 'create_room')).ok, 'to-be-suspended player is in a room');
assert((await http(`/api/admin/users/${SP.id}/suspend`, { method: 'POST', token: admin.token })).status === 200, 'admin suspends');
await wait(400);
assert(SP.suspended, 'suspended player is thrown out and told');
const sLogin = await http('/api/login', { method: 'POST', body: { username: SP.username, password: pw } });
assert(sLogin.status === 403 && sLogin.status !== 200 && !sLogin.token, 'suspended user cannot log in');
assert((await http('/api/me', { token: SP.token })).status === 401, 'suspended user session is dead');
assert((await http(`/api/admin/users/${SP.id}/reinstate`, { method: 'POST', token: admin.token })).status === 200, 'admin reinstates');
assert((await http('/api/login', { method: 'POST', body: { username: SP.username, password: pw } })).status === 200, 'reinstated user can log in again');

// profiles
const prof = await http(`/api/profile/${SP.id}`, { token: admin.token });
assert(prof.status === 200 && prof.user.username === SP.username && prof.summary.played === 0, 'profile of another player');
assert((await http(`/api/profile/${SP.id}`)).status === 401, 'profiles need a login');
assert((await http('/api/profile/nope', { token: admin.token })).status === 404, 'unknown profile is a 404');

// abuse limits: event flood and sign-up flood
const flood = await Promise.all(Array.from({ length: 40 }, () => send(R.socket, 'join_room', { code: 'ZZZZZ' })));
assert(flood.some((r) => /Too many requests/.test(r.error ?? '')), 'rapid events are rate limited');
assert(flood.some((r) => r.error === 'Room not found'), '...but the first few go through');
const statuses = [];
for (let i = 0; i < 40 && !statuses.includes(429); i++) {
  statuses.push((await http('/api/signup', { method: 'POST', body: { username: `fl${i}x${run}`, password: pw } })).status);
}
assert(statuses.includes(429) && statuses[0] === 201, 'sign-up flood is cut off after a reasonable number');
adminSock.disconnect(); [H, R, SP, PN].forEach((x) => x.socket.disconnect());
console.log('bots, rejoin, admin tools, profiles and abuse limits ok');
console.log(`PASS: accounts (signup/approve/reject/reset) + full round, +${end.roundResult.points} pts, reconnect ok`);
clients.forEach((c) => c.socket.disconnect());
process.exit(0);
