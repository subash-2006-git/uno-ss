import { describe, it, expect } from 'vitest';
import * as U from '../shared/uno.js';

// Deterministic rng so tests are repeatable.
function seeded(seed = 1) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

let nid = 1000;
const c = (color, value) => ({ id: nid++, color, value });
const names = (n) => Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'P' + i }));

// Build a controlled state: given hands, top card and colour. P0 to move.
function setup(hands, top = c('red', '5'), color = top.color, n = hands.length) {
  const s = U.createGame(names(n), seeded(7));
  s.players.forEach((p, i) => { p.hand = hands[i] ?? [c('blue', '1'), c('blue', '2')]; });
  s.discard = [top];
  s.deck = Array.from({ length: 40 }, () => c('green', '3'));
  s.color = color; s.turn = 0; s.dir = 1; s.phase = 'play';
  s.drawnCardId = null; s.pending = null; s.unoVuln = null;
  return s;
}

describe('deck', () => {
  it('has 108 cards with the right composition', () => {
    const d = U.createDeck();
    expect(d).toHaveLength(108);
    expect(d.filter((x) => x.value === 'wild')).toHaveLength(4);
    expect(d.filter((x) => x.value === 'wild4')).toHaveLength(4);
    expect(d.filter((x) => x.color === 'red' && x.value === '0')).toHaveLength(1);
    expect(d.filter((x) => x.color === 'red' && x.value === '7')).toHaveLength(2);
    expect(d.filter((x) => x.color === 'red' && x.value === 'draw2')).toHaveLength(2);
    expect(new Set(d.map((x) => x.id)).size).toBe(108);
  });
  it('uses two decks above 8 players and deals 16 players', () => {
    expect(U.deckCopiesFor(8)).toBe(1);
    expect(U.deckCopiesFor(9)).toBe(2);
    const s = U.createGame(names(16), seeded(3));
    expect(s.players.every((p) => p.hand.length === 7)).toBe(true);
    expect(s.deck.length + s.discard.length + 16 * 7).toBe(216);
  });
  it('rejects bad player counts', () => {
    expect(() => U.createGame(names(1))).toThrow();
    expect(() => U.createGame(names(17))).toThrow();
  });
});

describe('card effects', () => {
  it('rejects non-matching cards and out-of-turn play', () => {
    const a = c('blue', '9');
    const s = setup([[a, c('red', '1')], []]);
    expect(U.playCard(s, 'p0', a.id).ok).toBe(false);
    expect(U.playCard(s, 'p1', s.players[1].hand[0]?.id).ok).toBe(false);
  });
  it('number card advances turn', () => {
    const a = c('red', '9');
    const s = setup([[a, c('blue', '1')], [], []]);
    expect(U.playCard(s, 'p0', a.id).ok).toBe(true);
    expect(s.turn).toBe(1);
  });
  it('skip skips the next player', () => {
    const a = c('red', 'skip');
    const s = setup([[a, c('blue', '1')], [], []]);
    U.playCard(s, 'p0', a.id);
    expect(s.turn).toBe(2);
  });
  it('reverse flips direction (3+ players) and acts as skip with 2', () => {
    const a = c('red', 'reverse');
    const s3 = setup([[a, c('blue', '1')], [], []]);
    U.playCard(s3, 'p0', a.id);
    expect(s3.dir).toBe(-1);
    expect(s3.turn).toBe(2);
    const b = c('red', 'reverse');
    const s2 = setup([[b, c('blue', '1')], []]);
    U.playCard(s2, 'p0', b.id);
    expect(s2.turn).toBe(0);
  });
  it('draw two penalises and skips the next player (no stacking)', () => {
    const a = c('red', 'draw2');
    const s = setup([[a, c('blue', '1')], [c('red', 'draw2')], []]);
    U.playCard(s, 'p0', a.id);
    expect(s.players[1].hand).toHaveLength(3);
    expect(s.turn).toBe(2);
  });
  it('wild needs a colour and sets it', () => {
    const w = c('wild', 'wild');
    const s = setup([[w, c('blue', '1')], []]);
    expect(U.playCard(s, 'p0', w.id).ok).toBe(false);
    expect(U.playCard(s, 'p0', w.id, 'green').ok).toBe(true);
    expect(s.color).toBe('green');
  });
});

describe('drawing', () => {
  it('draws one; unplayable draw ends turn', () => {
    const s = setup([[c('blue', '1'), c('blue', '2')], []]);
    s.deck.push(c('green', '3'));
    U.drawCard(s, 'p0');
    expect(s.players[0].hand).toHaveLength(3);
    expect(s.turn).toBe(1);
  });
  it('playable draw may be played or passed, and only that card', () => {
    const s = setup([[c('blue', '1'), c('blue', '2')], []]);
    const red = c('red', '8');
    s.deck.push(red);
    U.drawCard(s, 'p0');
    expect(s.turn).toBe(0);
    expect(s.drawnCardId).toBe(red.id);
    expect(U.playCard(s, 'p0', s.players[0].hand[0].id).ok).toBe(false);
    expect(U.passTurn(s, 'p0').ok).toBe(true);
    expect(s.turn).toBe(1);
  });
  it('reshuffles the discard pile when the deck runs out', () => {
    const s = setup([[c('blue', '1'), c('blue', '2')], []]);
    s.deck = [];
    s.discard = [c('red', '1'), c('red', '2'), c('red', '5')];
    U.drawCard(s, 'p0');
    expect(s.discard).toHaveLength(1);
    expect(s.players[0].hand).toHaveLength(3);
  });
});

describe('wild draw four', () => {
  it('challenge succeeds against an illegal play', () => {
    const w4 = c('wild', 'wild4');
    const s = setup([[w4, c('red', '1')], [c('blue', '1')], []]);
    U.playCard(s, 'p0', w4.id, 'blue');
    expect(s.phase).toBe('challenge');
    expect(s.pending.legal).toBe(false);
    U.resolveChallenge(s, 'p1', true);
    expect(s.players[0].hand).toHaveLength(5); // 1 + 4
    expect(s.players[1].hand).toHaveLength(1);
    expect(s.turn).toBe(1);
  });
  it('failed challenge costs the challenger 6', () => {
    const w4 = c('wild', 'wild4');
    const s = setup([[w4, c('blue', '1')], [c('blue', '1')], []]);
    U.playCard(s, 'p0', w4.id, 'blue');
    expect(s.pending.legal).toBe(true);
    U.resolveChallenge(s, 'p1', true);
    expect(s.players[1].hand).toHaveLength(7);
    expect(s.turn).toBe(2);
  });
  it('accepting draws 4 and skips', () => {
    const w4 = c('wild', 'wild4');
    const s = setup([[w4, c('blue', '1')], [c('blue', '1')], []]);
    U.playCard(s, 'p0', w4.id, 'blue');
    U.resolveChallenge(s, 'p1', false);
    expect(s.players[1].hand).toHaveLength(5);
    expect(s.turn).toBe(2);
  });
});

describe('UNO call', () => {
  it('can be caught after the grace period, not before', () => {
    const a = c('red', '9');
    const s = setup([[a, c('blue', '1')], [], []]);
    U.playCard(s, 'p0', a.id, undefined, Math.random, 1000);
    expect(s.unoVuln.id).toBe('p0');
    expect(U.catchUno(s, 'p1', Math.random, 1100).ok).toBe(false);
    expect(U.catchUno(s, 'p1', Math.random, 1000 + U.UNO_GRACE_MS).ok).toBe(true);
    expect(s.players[0].hand).toHaveLength(3);
  });
  it('calling UNO in time protects the player', () => {
    const a = c('red', '9');
    const s = setup([[a, c('blue', '1')], [], []]);
    U.playCard(s, 'p0', a.id, undefined, Math.random, 1000);
    U.callUno(s, 'p0');
    expect(U.catchUno(s, 'p1', Math.random, 9999).ok).toBe(false);
  });
  it('pre-calling UNO at two cards avoids exposure', () => {
    const a = c('red', '9');
    const s = setup([[a, c('blue', '1')], [], []]);
    U.callUno(s, 'p0');
    U.playCard(s, 'p0', a.id);
    expect(s.unoVuln).toBe(null);
  });
});

describe('scoring', () => {
  it('winner scores opponents\' hands and the match ends at 500', () => {
    const last = c('red', '9');
    const s = setup([[last], [c('wild', 'wild'), c('red', 'skip'), c('blue', '7')], [c('wild', 'wild4')]]);
    U.playCard(s, 'p0', last.id);
    expect(s.phase).toBe('roundOver');
    expect(s.roundResult.points).toBe(50 + 20 + 7 + 50);
    expect(s.players[0].score).toBe(127);
    const s2 = setup([[c('red', '9')], [c('wild', 'wild')]]);
    s2.players[0].score = 480;
    U.playCard(s2, 'p0', s2.players[0].hand[0].id);
    expect(s2.phase).toBe('matchOver');
    expect(s2.winnerId).toBe('p0');
  });
  it('last-card Draw Two makes the victim draw before scoring', () => {
    const last = c('red', 'draw2');
    const s = setup([[last], [c('blue', '4')]]);
    U.playCard(s, 'p0', last.id);
    expect(s.roundResult.points).toBe(4 + 3 + 3);
  });
});

describe('leaving', () => {
  it('removing a player returns cards and keeps the turn sane', () => {
    const s = setup([[c('red', '1')], [c('red', '2')], [c('red', '3')]]);
    s.turn = 1;
    const before = s.deck.length;
    U.removePlayer(s, 'p1');
    expect(s.deck.length).toBe(before + 1);
    expect(s.players[s.turn].id).toBe('p2');
  });
  it('match ends when fewer than 2 remain', () => {
    const s = setup([[c('red', '1')], [c('red', '2')]]);
    U.removePlayer(s, 'p0');
    expect(s.phase).toBe('matchOver');
    expect(s.winnerId).toBe('p1');
  });
});

describe('simulation: random bots never deadlock and conserve cards', () => {
  function botGame(n, seed) {
    const rng = seeded(seed);
    const s = U.createGame(names(n), rng);
    const total = s.deck.length + s.discard.length + s.players.reduce((a, p) => a + p.hand.length, 0);
    for (let step = 0; step < 6000 && s.phase !== 'roundOver' && s.phase !== 'matchOver'; step++) {
      const id = U.actorId(s);
      const p = s.players.find((x) => x.id === id);
      if (s.phase === 'challenge') {
        U.resolveChallenge(s, id, rng() < 0.5, rng);
      } else {
        const playable = p.hand.filter((x) => U.isPlayable(x, U.topCard(s), s.color) && (s.drawnCardId == null || x.id === s.drawnCardId));
        if (playable.length && rng() < 0.9) {
          const card = playable[Math.floor(rng() * playable.length)];
          const r = U.playCard(s, id, card.id, U.COLORS[Math.floor(rng() * 4)], rng);
          if (!r.ok) throw new Error(r.error);
        } else if (s.drawnCardId != null) U.passTurn(s, id);
        else U.drawCard(s, id, rng);
      }
      const now = s.deck.length + s.discard.length + s.players.reduce((a, q) => a + q.hand.length, 0);
      if (now !== total) throw new Error('card count changed');
    }
    return s;
  }
  it('plays 1000 rounds for 2-16 players', () => {
    let finished = 0;
    for (let g = 0; g < 1000; g++) {
      const n = 2 + (g % 15);
      const s = botGame(n, g + 1);
      if (s.phase === 'roundOver' || s.phase === 'matchOver') finished++;
    }
    expect(finished).toBe(1000);
  });
});
