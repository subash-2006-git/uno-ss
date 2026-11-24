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
assert((await send(clients[0].socket, 'start_game')).ok, 'start');
await new Promise((r) => setTimeout(r, 100));

for (const c of clients) {
  assert(c.room.game.hand.length === 7, 'own hand dealt');
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
console.log(`PASS: accounts (signup/approve/reject/reset) + full round, +${end.roundResult.points} pts, reconnect ok`);
clients.forEach((c) => c.socket.disconnect());
process.exit(0);
