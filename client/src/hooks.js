import { useEffect, useMemo, useRef, useState } from 'react';
import { send } from './socket.js';
import { play } from './sound.js';

const ACTION_VALUES = new Set(['skip', 'reverse', 'draw2', 'wild', 'wild4']);

// Plays sound effects by watching how the game view changes between updates.
export function useGameFx(g, me) {
  const prev = useRef(null);
  useEffect(() => {
    const p = prev.current;
    prev.current = {
      topId: g.top.id, deck: g.deckCount, hand: g.hand.length, phase: g.phase,
      myMove: (g.phase === 'play' && g.turn === me) || (g.phase === 'challenge' && g.pending?.challenger === me),
      vuln: g.unoVulnId, round: g.round,
    };
    if (!p) return; // first render: stay quiet

    if (g.phase !== p.phase && (g.phase === 'roundOver' || g.phase === 'matchOver')) {
      return play((g.roundResult?.winnerId ?? g.winnerId) === me ? 'win' : 'end');
    }
    if (g.top.id !== p.topId) play(ACTION_VALUES.has(g.top.value) ? 'action' : 'play');
    else if (g.deckCount < p.deck || g.hand.length > p.hand) play('draw');

    const myMove = (g.phase === 'play' && g.turn === me) || (g.phase === 'challenge' && g.pending?.challenger === me);
    if (myMove && !p.myMove) play('turn');
    if (g.unoVulnId && g.unoVulnId !== p.vuln) play('uno');
  }, [g, me]);
}

// Server-synced countdown. `timer` = { deadline, now } from the server; returns whole seconds left (or null).
export function useCountdown(timer, intervalMs) {
  const offset = useMemo(() => (timer ? timer.now - Date.now() : 0), [timer]); // server clock minus ours
  const [, force] = useState(0);
  useEffect(() => {
    if (!timer) return undefined;
    const id = setInterval(() => force((n) => n + 1), intervalMs);
    return () => clearInterval(id);
  }, [timer, intervalMs]);
  if (!timer) return null;
  return Math.max(0, timer.deadline - (Date.now() + offset));
}

// Round-trip time to the server in ms (null while unknown). Only pings while `active`.
export function useLatency(active, everyMs = 6000) {
  const [ms, setMs] = useState(null);
  useEffect(() => {
    if (!active) return undefined;
    let stop = false;
    const ping = async () => {
      const t = performance.now();
      const res = await send('ping_check');
      if (!stop) setMs(res?.error ? null : Math.round(performance.now() - t));
    };
    ping();
    const id = setInterval(ping, everyMs);
    return () => { stop = true; clearInterval(id); };
  }, [active, everyMs]);
  return ms;
}
