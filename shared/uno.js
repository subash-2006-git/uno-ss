// Pure UNO rules engine (official rules, free-for-all, 2-16 players).
// State is plain JSON so it can be stored in Neon. Mutating functions return
// { ok: true } or { ok: false, error }.

export const COLORS = ['red', 'yellow', 'green', 'blue'];
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 16;
export const WINNING_SCORE = 500;
export const HAND_SIZE = 7;
export const UNO_GRACE_MS = 1500;

// Quick reactions players can send (the client maps each id to a picture; the server only accepts these ids).
export const EMOTE_IDS = ['thumbs', 'laugh', 'wow', 'angry', 'clap', 'fire', 'cry', 'party'];

const ACTIONS = ['skip', 'reverse', 'draw2'];
const err = (error) => ({ ok: false, error });
const OK = { ok: true };

/* ---------- deck ---------- */

export function createDeck(copies = 1) {
  const cards = [];
  let id = 0;
  const add = (color, value) => cards.push({ id: id++, color, value });
  for (let c = 0; c < copies; c++) {
    for (const color of COLORS) {
      add(color, '0');
      for (let v = 1; v <= 9; v++) { add(color, String(v)); add(color, String(v)); }
      for (const a of ACTIONS) { add(color, a); add(color, a); }
    }
    for (let i = 0; i < 4; i++) { add('wild', 'wild'); add('wild', 'wild4'); }
  }
  return cards;
}

export function shuffle(arr, rng = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 16 players x 7 cards = 112 > 108, so bigger tables shuffle in two decks.
export const deckCopiesFor = (playerCount) => (playerCount > 8 ? 2 : 1);

export function cardPoints(card) {
  if (card.color === 'wild') return 50;
  if (ACTIONS.includes(card.value)) return 20;
  return parseInt(card.value, 10);
}

export const handPoints = (hand) => hand.reduce((s, c) => s + cardPoints(c), 0);

/* ---------- helpers ---------- */

export const topCard = (s) => s.discard[s.discard.length - 1];
const idxOf = (s, id) => s.players.findIndex((p) => p.id === id);
const nextIdx = (s, from, steps = 1) => {
  const n = s.players.length;
  return (((from + s.dir * steps) % n) + n) % n;
};
const log = (s, msg) => { s.log.push(msg); if (s.log.length > 30) s.log.shift(); };

export function isPlayable(card, top, color) {
  return card.color === 'wild' || card.color === color || card.value === top.value;
}

export function drawOne(s, rng = Math.random) {
  if (!s.deck.length && s.discard.length > 1) {
    const top = s.discard.pop();
    s.deck = shuffle(s.discard, rng);
    s.discard = [top];
  }
  return s.deck.pop() ?? null;
}

function giveCards(s, idx, count, rng) {
  const p = s.players[idx];
  let got = 0;
  for (let i = 0; i < count; i++) {
    const c = drawOne(s, rng);
    if (!c) break;
    p.hand.push(c);
    got++;
  }
  p.uno = false;
  return got;
}

/* ---------- game setup ---------- */

// opts.maxRounds: play exactly this many rounds (highest total wins). 0 / unset: first to WINNING_SCORE.
export function createGame(players, rng = Math.random, opts = {}) {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new Error(`UNO needs ${MIN_PLAYERS}-${MAX_PLAYERS} players`);
  }
  const s = {
    players: players.map((p) => ({ id: p.id, name: p.name, hand: [], score: 0, uno: false, roundsWon: 0, bot: Boolean(p.bot) })),
    deck: [], discard: [], dir: 1, color: 'red', turn: 0, round: 0,
    phase: 'play', drawnCardId: null, pending: null, unoVuln: null,
    roundResult: null, winnerId: null, log: [], maxRounds: Math.max(0, opts.maxRounds | 0),
  };
  startRound(s, rng);
  return s;
}

export function startRound(s, rng = Math.random) {
  const n = s.players.length;
  const deck = shuffle(createDeck(deckCopiesFor(n)), rng);
  for (const p of s.players) { p.hand = []; p.uno = false; }
  for (let i = 0; i < HAND_SIZE; i++) for (const p of s.players) p.hand.push(deck.pop());

  let first = deck.pop();
  while (first.value === 'wild4') { // a starting Wild Draw Four goes back into the deck
    deck.push(first); shuffle(deck, rng); first = deck.pop();
  }
  s.deck = deck;
  s.discard = [first];
  s.dir = 1;
  s.color = first.color === 'wild' ? COLORS[Math.floor(rng() * 4)] : first.color;
  s.turn = s.round % n;
  s.round += 1;
  s.phase = 'play';
  s.drawnCardId = null; s.pending = null; s.unoVuln = null; s.roundResult = null;
  log(s, `Round ${s.round} begins`);

  // The first card's effect applies to the first player.
  if (first.value === 'skip') s.turn = nextIdx(s, s.turn);
  else if (first.value === 'reverse') { s.dir = -1; if (n === 2) s.turn = nextIdx(s, s.turn); }
  else if (first.value === 'draw2') { giveCards(s, s.turn, 2, rng); s.turn = nextIdx(s, s.turn); }
  return s;
}

/* ---------- actions ---------- */

function endRound(s, winnerIdx) {
  const w = s.players[winnerIdx];
  const points = s.players.reduce((sum, p, i) => (i === winnerIdx ? sum : sum + handPoints(p.hand)), 0);
  w.score += points;
  w.roundsWon = (w.roundsWon ?? 0) + 1;
  s.roundResult = { winnerId: w.id, points };
  s.unoVuln = null; s.pending = null; s.drawnCardId = null;
  const fixedRounds = (s.maxRounds ?? 0) > 0;
  const matchEnds = fixedRounds ? s.round >= s.maxRounds : w.score >= WINNING_SCORE;
  if (matchEnds) {
    s.phase = 'matchOver';
    // Fixed rounds: highest total wins, ties go to the player who won more rounds. First-to-500: the round winner.
    s.winnerId = fixedRounds
      ? [...s.players].sort((a, b) => b.score - a.score || (b.roundsWon ?? 0) - (a.roundsWon ?? 0))[0].id
      : w.id;
  } else s.phase = 'roundOver';
  log(s, `${w.name} wins the round (+${points})`);
}

export function playCard(s, pid, cardId, chosenColor, rng = Math.random, now = Date.now()) {
  if (s.phase !== 'play') return err('Cannot play right now');
  const idx = idxOf(s, pid);
  if (idx < 0 || idx !== s.turn) return err('Not your turn');
  const p = s.players[idx];
  const ci = p.hand.findIndex((c) => c.id === cardId);
  if (ci < 0) return err('You do not hold that card');
  const card = p.hand[ci];
  if (s.drawnCardId != null && card.id !== s.drawnCardId) return err('You may only play the card you just drew');
  if (!isPlayable(card, topCard(s), s.color)) return err('That card does not match');
  if (card.color === 'wild' && !COLORS.includes(chosenColor)) return err('Choose a colour');

  const prevColor = s.color;
  const hadColor = p.hand.some((c) => c.id !== card.id && c.color === prevColor);
  p.hand.splice(ci, 1);
  s.discard.push(card);
  s.drawnCardId = null;
  s.unoVuln = null;
  s.color = card.color === 'wild' ? chosenColor : card.color;
  log(s, `${p.name} played ${card.color === 'wild' ? '' : card.color + ' '}${card.value}${card.color === 'wild' ? ' → ' + s.color : ''}`);

  const n = s.players.length;
  let advance = 1;
  let victim = -1, draws = 0;
  switch (card.value) {
    case 'skip': advance = 2; break;
    case 'reverse': s.dir *= -1; advance = n === 2 ? 2 : 1; break;
    case 'draw2': victim = nextIdx(s, idx); draws = 2; advance = 2; break;
    case 'wild4': {
      const challenger = nextIdx(s, idx);
      if (p.hand.length === 0) { // last card: no challenge, just the penalty
        giveCards(s, challenger, 4, rng);
        endRound(s, idx);
        return OK;
      }
      s.phase = 'challenge';
      s.pending = { offender: p.id, challenger: s.players[challenger].id, legal: !hadColor };
      s.turn = challenger;
      return OK;
    }
    default: break;
  }
  if (draws) giveCards(s, victim, draws, rng);
  if (p.hand.length === 0) { endRound(s, idx); return OK; }
  if (p.hand.length === 1 && !p.uno) s.unoVuln = { id: p.id, at: now };
  s.turn = nextIdx(s, idx, advance);
  return OK;
}

export function drawCard(s, pid, rng = Math.random) {
  if (s.phase !== 'play') return err('Cannot draw right now');
  const idx = idxOf(s, pid);
  if (idx < 0 || idx !== s.turn) return err('Not your turn');
  if (s.drawnCardId != null) return err('You already drew this turn');
  s.unoVuln = null;
  const p = s.players[idx];
  const card = drawOne(s, rng);
  if (!card) { s.turn = nextIdx(s, idx); return OK; }
  p.hand.push(card);
  p.uno = false;
  log(s, `${p.name} drew a card`);
  if (isPlayable(card, topCard(s), s.color)) s.drawnCardId = card.id;
  else s.turn = nextIdx(s, idx);
  return OK;
}

export function passTurn(s, pid) {
  if (s.phase !== 'play') return err('Cannot pass right now');
  const idx = idxOf(s, pid);
  if (idx < 0 || idx !== s.turn) return err('Not your turn');
  if (s.drawnCardId == null) return err('Draw a card first');
  s.drawnCardId = null;
  s.turn = nextIdx(s, idx);
  return OK;
}

// The player after a Wild Draw Four either challenges it or accepts the penalty.
export function resolveChallenge(s, pid, challenge, rng = Math.random) {
  if (s.phase !== 'challenge' || !s.pending) return err('Nothing to challenge');
  if (s.pending.challenger !== pid) return err('Not your decision');
  const off = idxOf(s, s.pending.offender);
  const ch = idxOf(s, pid);
  const { legal } = s.pending;
  s.phase = 'play';
  s.pending = null;
  if (!challenge) {
    giveCards(s, ch, 4, rng);
    log(s, `${s.players[ch].name} accepted +4`);
    s.turn = nextIdx(s, ch);
  } else if (!legal) {
    giveCards(s, off, 4, rng);
    log(s, `Challenge won! ${s.players[off].name} bluffed and draws 4`);
    s.turn = ch;
  } else {
    giveCards(s, ch, 6, rng);
    log(s, `Challenge failed. ${s.players[ch].name} draws 6`);
    s.turn = nextIdx(s, ch);
  }
  return OK;
}

export function callUno(s, pid) {
  const p = s.players.find((x) => x.id === pid);
  if (!p || p.hand.length === 0 || p.hand.length > 2) return err('You cannot call UNO now');
  p.uno = true;
  if (s.unoVuln?.id === pid) s.unoVuln = null;
  log(s, `${p.name}: UNO!`);
  return OK;
}

export function catchUno(s, byId, rng = Math.random, now = Date.now()) {
  const v = s.unoVuln;
  if (!v) return err('Nobody to catch');
  if (v.id === byId) return err('Call UNO yourself instead');
  if (now - v.at < UNO_GRACE_MS) return err('Give them a moment to call UNO');
  const idx = idxOf(s, v.id);
  s.unoVuln = null;
  if (idx < 0 || s.players[idx].hand.length !== 1) return err('Too late');
  giveCards(s, idx, 2, rng);
  log(s, `${s.players[idx].name} forgot to say UNO and draws 2`);
  return OK;
}

// A late joiner takes a seat between rounds (score starts at 0). Dealt in by the next startRound.
export function addPlayer(s, { id, name, bot = false }) {
  if (s.phase !== 'roundOver') return err('New players can only join between rounds');
  if (s.players.length >= MAX_PLAYERS) return err('Table is full');
  if (s.players.some((p) => p.id === id)) return err('Already seated');
  s.players.push({ id, name, hand: [], score: 0, uno: false, roundsWon: 0, bot: Boolean(bot) });
  log(s, `${name} joined the table`);
  return OK;
}

export function nextRound(s, rng = Math.random) {
  if (s.phase !== 'roundOver') return err('Round is not over');
  startRound(s, rng);
  return OK;
}

// A player leaves (or is dropped) mid-game: their cards go back under the deck.
export function removePlayer(s, pid) {
  const idx = idxOf(s, pid);
  if (idx < 0) return err('Not in game');
  const [gone] = s.players.splice(idx, 1);
  s.deck.unshift(...gone.hand);
  log(s, `${gone.name} left the game`);
  if (s.pending && (s.pending.offender === pid || s.pending.challenger === pid)) {
    s.pending = null;
    if (s.phase === 'challenge') s.phase = 'play';
  }
  if (s.unoVuln?.id === pid) s.unoVuln = null;
  if (s.players.length < MIN_PLAYERS) {
    if (s.phase !== 'matchOver') {
      s.phase = 'matchOver';
      s.winnerId = s.players[0]?.id ?? null;
    }
    return OK;
  }
  const wasTurn = idx === s.turn;
  if (idx < s.turn) s.turn -= 1;
  else if (wasTurn) {
    s.drawnCardId = null;
    s.turn = s.dir === 1 ? idx % s.players.length : (idx - 1 + s.players.length) % s.players.length;
  }
  return OK;
}

// A bot takes over a seat (a player left) or hands it back (they rejoined). Hand and score are kept.
export function setSeatBot(s, pid, isBot) {
  const p = s.players.find((x) => x.id === pid);
  if (!p) return err('Not seated');
  p.bot = Boolean(isBot);
  log(s, isBot ? `A bot is playing for ${p.name}` : `${p.name} is back`);
  return OK;
}

const colorCounts = (hand) => {
  const n = { red: 0, yellow: 0, green: 0, blue: 0 };
  for (const c of hand) if (c.color !== 'wild') n[c.color]++;
  return n;
};

// One move for a bot seat. Simple but sensible: keep the colour it holds most of, dump high-value
// cards first, hit the next player with action cards when they are about to win, never bluff a Wild Draw Four.
// Call again after a draw: if the drawn card is playable the same seat is still to move.
export function botMove(s, pid, rng = Math.random) {
  const idx = idxOf(s, pid);
  if (idx < 0) return err('Not seated');
  const p = s.players[idx];

  if (s.phase === 'challenge') {
    if (s.pending?.challenger !== pid) return err('Not your decision');
    return resolveChallenge(s, pid, rng() < 0.35, rng);
  }
  if (s.phase !== 'play' || s.turn !== idx) return err('Not your turn');

  const top = topCard(s);
  const playable = p.hand.filter((c) => isPlayable(c, top, s.color) && (s.drawnCardId == null || c.id === s.drawnCardId));
  if (!playable.length) return s.drawnCardId != null ? passTurn(s, pid) : drawCard(s, pid, rng);

  const counts = colorCounts(p.hand);
  const danger = s.players[nextIdx(s, idx)].hand.length <= 2;
  const nonWild = playable.filter((c) => c.color !== 'wild');
  const pool = nonWild.length ? nonWild : playable;
  const score = (c) => {
    let v = c.color === 'wild' ? (c.value === 'wild4' ? -3 : -1) : counts[c.color];
    if (ACTIONS.includes(c.value)) v += danger ? 6 : 1;
    return v + cardPoints(c) / 50 + rng() * 0.5;
  };
  const best = pool.map((c) => [score(c), c]).sort((a, b) => b[0] - a[0])[0][1];

  let color;
  if (best.color === 'wild') {
    const rest = colorCounts(p.hand.filter((c) => c.id !== best.id));
    const top1 = Object.entries(rest).sort((a, b) => b[1] - a[1])[0];
    color = top1[1] > 0 ? top1[0] : COLORS[Math.floor(rng() * 4)];
  }
  const r = playCard(s, pid, best.id, color, rng);
  if (r.ok && s.phase !== 'roundOver' && s.phase !== 'matchOver' && p.hand.length === 1) callUno(s, pid); // bots are polite
  return r;
}

// Id of whoever must act next (null when the round/match is over).
export function actorId(s) {
  if (s.phase === 'challenge') return s.pending?.challenger ?? null;
  if (s.phase === 'play') return s.players[s.turn]?.id ?? null;
  return null;
}

// Minimal move for an absent player: accept penalties, draw, pass.
export function autoMove(s, pid, rng = Math.random) {
  if (actorId(s) !== pid) return err('Not their move');
  if (s.phase === 'challenge') return resolveChallenge(s, pid, false, rng);
  if (s.drawnCardId == null) {
    const r = drawCard(s, pid, rng);
    if (!r.ok || s.turn !== idxOf(s, pid) || s.drawnCardId == null) return r;
  }
  return passTurn(s, pid);
}

/* ---------- per-player view (hides other hands and the deck) ---------- */

export function viewFor(s, pid) {
  const me = s.players.find((p) => p.id === pid);
  return {
    players: s.players.map((p) => ({ id: p.id, name: p.name, count: p.hand.length, score: p.score, uno: p.uno, bot: Boolean(p.bot) })),
    hand: me ? me.hand : [],
    top: topCard(s),
    color: s.color,
    dir: s.dir,
    turn: s.players[s.turn]?.id ?? null,
    phase: s.phase,
    drawnCardId: s.drawnCardId,
    pending: s.pending ? { offender: s.pending.offender, challenger: s.pending.challenger } : null,
    deckCount: s.deck.length,
    round: s.round,
    maxRounds: s.maxRounds ?? 0,
    roundResult: s.roundResult,
    winnerId: s.winnerId,
    unoVulnId: s.unoVuln?.id ?? null,
    log: s.log.slice(-6),
  };
}
