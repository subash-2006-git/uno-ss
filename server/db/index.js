import fs from 'node:fs';
import pg from 'pg';

const url = process.env.DATABASE_URL;
export const dbEnabled = Boolean(url);
const pool = dbEnabled ? new pg.Pool({ connectionString: url, max: 5 }) : null;

// Persistence is best-effort: a DB hiccup must never freeze a live game.
const safe = (label, fn) => async (...args) => {
  if (!pool) return undefined;
  try { return await fn(...args); } catch (e) { console.error(`[db] ${label}:`, e.message); return undefined; }
};

export async function initDb() {
  if (!pool) return console.log('[db] DATABASE_URL not set: running in-memory (nothing persists)');
  const schema = fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
  await pool.query(schema);
  console.log('[db] connected to Neon, schema ready');
}

/* ---------- users & sessions (Postgres, or in-memory when no DATABASE_URL) ---------- */

const mem = { users: new Map(), sessions: new Map() };
const toUser = (r) => r && ({
  id: r.id, username: r.username, hash: r.password_hash ?? r.hash,
  status: r.status, isAdmin: r.is_admin ?? r.isAdmin, createdAt: r.created_at ?? r.createdAt,
});

export async function createUser({ id, username, hash, status = 'pending', isAdmin = false }) {
  const lc = username.toLowerCase();
  if (!pool) {
    if ([...mem.users.values()].some((u) => u.username.toLowerCase() === lc)) return null;
    const u = { id, username, hash, status, isAdmin, createdAt: new Date() };
    mem.users.set(id, u);
    return u;
  }
  const r = await pool.query(
    `INSERT INTO users (id, username, username_lc, password_hash, status, is_admin)
     VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (username_lc) DO NOTHING RETURNING *`,
    [id, username, lc, hash, status, isAdmin]);
  return toUser(r.rows[0]) ?? null;
}

export async function getUserByName(username) {
  const lc = username.toLowerCase();
  if (!pool) return [...mem.users.values()].find((u) => u.username.toLowerCase() === lc) ?? null;
  return toUser((await pool.query('SELECT * FROM users WHERE username_lc = $1', [lc])).rows[0]) ?? null;
}

export async function getUserById(id) {
  if (!pool) return mem.users.get(id) ?? null;
  return toUser((await pool.query('SELECT * FROM users WHERE id = $1', [id])).rows[0]) ?? null;
}

export async function listUsers() {
  if (!pool) return [...mem.users.values()];
  return (await pool.query('SELECT * FROM users ORDER BY created_at DESC')).rows.map(toUser);
}

// fields: { status?, hash?, isAdmin? }
export async function updateUser(id, f) {
  if (!pool) { const u = mem.users.get(id); if (u) Object.assign(u, f); return u ?? null; }
  const r = await pool.query(
    `UPDATE users SET status = COALESCE($2, status), password_hash = COALESCE($3, password_hash),
            is_admin = COALESCE($4, is_admin) WHERE id = $1 RETURNING *`,
    [id, f.status ?? null, f.hash ?? null, f.isAdmin ?? null]);
  return toUser(r.rows[0]) ?? null;
}

export async function createSession(tokenHash, userId) {
  if (!pool) return void mem.sessions.set(tokenHash, { userId, at: Date.now() });
  await pool.query('INSERT INTO sessions (token_hash, user_id) VALUES ($1,$2)', [tokenHash, userId]);
}

const SESSION_DAYS = 30;
export async function getSessionUserId(tokenHash) {
  if (!pool) {
    const s = mem.sessions.get(tokenHash);
    return s && Date.now() - s.at < SESSION_DAYS * 864e5 ? s.userId : null;
  }
  const r = await pool.query(
    `SELECT user_id FROM sessions WHERE token_hash = $1 AND created_at > now() - make_interval(days => $2)`,
    [tokenHash, SESSION_DAYS]);
  return r.rows[0]?.user_id ?? null;
}

export async function deleteSession(tokenHash) {
  if (!pool) return void mem.sessions.delete(tokenHash);
  await pool.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
}

export async function deleteUserSessions(userId) {
  if (!pool) { for (const [k, s] of mem.sessions) if (s.userId === userId) mem.sessions.delete(k); return; }
  await pool.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
}

export const saveRoom = safe('saveRoom', (room) =>
  pool.query(
    `INSERT INTO rooms (code, host_id, status, data, updated_at) VALUES ($1,$2,$3,$4,now())
     ON CONFLICT (code) DO UPDATE SET host_id=$2, status=$3, data=$4, updated_at=now()`,
    [room.code, room.hostId, room.status,
      JSON.stringify({
        members: room.members, game: room.game, settings: room.settings,
        spectators: room.spectators, waiting: room.waiting,
      })]));

export const deleteRoom = safe('deleteRoom', (code) =>
  pool.query('DELETE FROM rooms WHERE code = $1', [code]));

export const loadRooms = safe('loadRooms', async () =>
  (await pool.query(
    `SELECT code, host_id, status, data FROM rooms WHERE updated_at > now() - interval '1 day'`)).rows);

/* ---------- match history & stats (Postgres, or in-memory without DATABASE_URL) ---------- */

mem.matches = [];

// Final standings: the match winner first, then by score.
function standings(game) {
  return [...game.players]
    .sort((a, b) => (b.id === game.winnerId) - (a.id === game.winnerId) || b.score - a.score)
    .map((p, i) => ({ playerId: p.id, name: p.name, score: p.score, roundsWon: p.roundsWon ?? 0, placing: i + 1 }));
}

export async function recordMatch(code, game) {
  const rows = standings(game);
  if (!pool) {
    mem.matches.push({ id: mem.matches.length + 1, roomCode: code, winnerId: game.winnerId, rounds: game.round, finishedAt: new Date(), scores: rows });
    return;
  }
  try {
    const m = await pool.query(
      'INSERT INTO matches (room_code, winner_id, rounds) VALUES ($1,$2,$3) RETURNING id',
      [code, game.winnerId, game.round]);
    const id = m.rows[0].id;
    for (const r of rows) {
      await pool.query(
        'INSERT INTO match_scores (match_id, player_id, name, score, rounds_won, placing) VALUES ($1,$2,$3,$4,$5,$6)',
        [id, r.playerId, r.name, r.score, r.roundsWon, r.placing]);
    }
  } catch (e) { console.error('[db] recordMatch:', e.message); }
}

export async function leaderboard() {
  if (!pool) {
    const agg = new Map();
    for (const m of mem.matches) for (const s of m.scores) {
      const a = agg.get(s.playerId) ?? { id: s.playerId, name: s.name, played: 0, wins: 0 };
      a.name = s.name; a.played++; if (m.winnerId === s.playerId) a.wins++;
      agg.set(s.playerId, a);
    }
    return [...agg.values()].sort((a, b) => b.wins - a.wins || a.played - b.played).slice(0, 10);
  }
  try {
    return (await pool.query(
      `SELECT s.player_id AS id,
              (array_agg(s.name ORDER BY m.finished_at DESC))[1] AS name,
              COUNT(*)::int AS played,
              COUNT(*) FILTER (WHERE m.winner_id = s.player_id)::int AS wins
         FROM match_scores s JOIN matches m ON m.id = s.match_id
        GROUP BY s.player_id
        ORDER BY wins DESC, played ASC
        LIMIT 10`)).rows;
  } catch (e) { console.error('[db] leaderboard:', e.message); return []; }
}

// Everything the stats page needs for one player.
export async function userStats(userId) {
  let recent;
  if (!pool) {
    recent = mem.matches
      .filter((m) => m.scores.some((s) => s.playerId === userId))
      .sort((a, b) => b.finishedAt - a.finishedAt || b.id - a.id)
      .map((m) => {
        const s = m.scores.find((x) => x.playerId === userId);
        return { id: m.id, roomCode: m.roomCode, finishedAt: m.finishedAt, rounds: m.rounds, score: s.score, roundsWon: s.roundsWon,
          placing: s.placing, players: m.scores.length, winner: m.scores.find((x) => x.playerId === m.winnerId)?.name ?? null,
          won: m.winnerId === userId };
      });
  } else {
    try {
      recent = (await pool.query(
        `SELECT m.id, m.room_code AS "roomCode", m.finished_at AS "finishedAt", m.rounds,
                s.score, s.rounds_won AS "roundsWon", s.placing,
                (SELECT COUNT(*) FROM match_scores x WHERE x.match_id = m.id)::int AS players,
                (SELECT x.name FROM match_scores x WHERE x.match_id = m.id AND x.player_id = m.winner_id) AS winner,
                (m.winner_id = s.player_id) AS won
           FROM match_scores s JOIN matches m ON m.id = s.match_id
          WHERE s.player_id = $1 ORDER BY m.finished_at DESC LIMIT 200`, [userId])).rows;
    } catch (e) { console.error('[db] userStats:', e.message); recent = []; }
  }
  const played = recent.length;
  const wins = recent.filter((r) => r.won).length;
  let streak = 0;
  for (const r of recent) { if (r.won) streak++; else break; } // current win streak (newest first)
  return {
    summary: {
      played, wins,
      winRate: played ? Math.round((wins / played) * 100) : 0,
      avgScore: played ? Math.round(recent.reduce((a, r) => a + r.score, 0) / played) : 0,
      bestScore: played ? Math.max(...recent.map((r) => r.score)) : 0,
      roundsWon: recent.reduce((a, r) => a + (r.roundsWon ?? 0), 0),
      streak,
    },
    recent: recent.slice(0, 15),
  };
}
