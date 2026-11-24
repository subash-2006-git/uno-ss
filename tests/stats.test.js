import { describe, it, expect, beforeAll } from 'vitest';

// Runs against the in-memory store (no DATABASE_URL), same code path as the dev server without Neon.
let db;
beforeAll(async () => {
  delete process.env.DATABASE_URL;
  db = await import('../server/db/index.js');
});

const game = (players, winnerId, round = 5) => ({
  winnerId, round, players: players.map(([id, name, score, roundsWon]) => ({ id, name, score, roundsWon })),
});

describe('match history & stats', () => {
  it('has no data for a new player', async () => {
    const s = await db.userStats('nobody');
    expect(s.summary.played).toBe(0);
    expect(s.recent).toEqual([]);
  });

  it('records matches and computes the stats summary', async () => {
    await db.recordMatch('AAAAA', game([['a', 'Ann', 520, 3], ['b', 'Bob', 310, 1], ['c', 'Cy', 90, 0]], 'a', 4));
    await db.recordMatch('BBBBB', game([['a', 'Ann', 200, 1], ['b', 'Bob', 505, 4]], 'b', 5));
    await db.recordMatch('CCCCC', game([['a', 'Ann', 510, 3], ['c', 'Cy', 120, 0]], 'a', 3));

    const ann = await db.userStats('a');
    expect(ann.summary).toMatchObject({ played: 3, wins: 2, winRate: 67, bestScore: 520, roundsWon: 7 });
    expect(ann.summary.avgScore).toBe(410); // (520 + 200 + 510) / 3
    expect(ann.summary.streak).toBe(1);     // newest match is a win, the one before was a loss
    expect(ann.recent).toHaveLength(3);
    expect(ann.recent[0]).toMatchObject({ roomCode: 'CCCCC', won: true, placing: 1, players: 2 });
    const lost = ann.recent.find((r) => r.roomCode === 'BBBBB');
    expect(lost).toMatchObject({ won: false, placing: 2, winner: 'Bob' });
  });

  it('ranks the winner first even if scores tie', async () => {
    await db.recordMatch('DDDDD', game([['x', 'Xan', 500, 2], ['y', 'Yu', 500, 2]], 'y'));
    expect((await db.userStats('y')).recent[0].placing).toBe(1);
    expect((await db.userStats('x')).recent[0].placing).toBe(2);
  });

  it('adds average placing and podium finishes', async () => {
    const ann = (await db.userStats('a')).summary;
    expect(ann.avgPlace).toBe(1.3); // placings 1, 2, 1
    expect(ann.podiums).toBe(3);
  });

  it('keeps computer players out of history and the leaderboard, but counts them in the placing', async () => {
    await db.recordMatch('EEEEE', game([['a', 'Ann', 100, 0], ['bot-1', 'Nova', 520, 4], ['bot-2', 'Pixel', 300, 1]], 'bot-1'));
    const ann = (await db.userStats('a')).recent[0];
    expect(ann).toMatchObject({ roomCode: 'EEEEE', won: false, placing: 3, players: 3, winner: 'Nova' });
    expect((await db.userStats('bot-1')).summary.played).toBe(0);
    expect((await db.leaderboard()).some((r) => String(r.id).startsWith('bot-'))).toBe(false);
  });

  it('builds a leaderboard by wins', async () => {
    const board = await db.leaderboard();
    expect(board[0]).toMatchObject({ name: 'Ann', wins: 2, played: 4 }); // includes the match with bots
  });
});
