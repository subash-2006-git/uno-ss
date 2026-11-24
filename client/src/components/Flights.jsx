import { useLayoutEffect, useRef, useState } from 'react';
import Card from './Card.jsx';

const rectOf = (sel) => document.querySelector(sel)?.getBoundingClientRect() ?? null;
const seatRect = (pid) => {
  const r = rectOf(`.opp[data-pid="${CSS.escape(pid)}"]`);
  return r ? { left: r.left + r.width / 2 - 14, top: r.top + r.height / 2 - 21, width: 28, height: 42 } : null;
};

function Flight({ f, base, onDone }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const at = (r, w) => `translate(${r.left + r.width / 2 - base.w / 2}px, ${r.top + r.height / 2 - base.h / 2}px) scale(${Math.max(0.2, r.width / base.w)}) rotate(${w}deg)`;
    const anim = el.animate(
      [
        { transform: at(f.from, f.rot0 ?? 0), opacity: 0, offset: 0 },
        { transform: at(f.from, f.rot0 ?? 0), opacity: 1, offset: 0.02 },
        { transform: at(f.to, f.rot1 ?? 0), opacity: 1, offset: 1 },
      ],
      { duration: f.ms, delay: f.delay ?? 0, easing: 'cubic-bezier(.22,.8,.25,1)', fill: 'both' },
    );
    anim.onfinish = () => onDone(f);
    return () => anim.cancel();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div ref={ref} className="flight" style={{ width: base.w, height: base.h }}>
      {f.back ? <Card back /> : <Card card={f.card} />}
    </div>
  );
}

// Watches the game view and flies cards: hand/seat -> pile when someone plays, deck -> hand/seat when someone draws.
export default function Flights({ g, me, lastPlay, enabled, tilt, onLand }) {
  const prev = useRef(null);
  const [flights, setFlights] = useState([]);
  const [base, setBase] = useState({ w: 74, h: 110 });

  useLayoutEffect(() => {
    const p = prev.current;
    prev.current = { topId: g.top.id, round: g.round, counts: Object.fromEntries(g.players.map((x) => [x.id, x.count])) };
    if (!p || !enabled || p.round !== g.round) return;

    const pile = rectOf('.discard .topcard .card');
    const deck = rectOf('.drawpile .card');
    const hand = rectOf('.hand');
    if (!pile || !deck) return;
    setBase({ w: pile.width, h: pile.height });
    const handSpot = hand && { left: hand.left + hand.width / 2 - 20, top: hand.top + 20, width: 40, height: 60 };
    const spotFor = (id) => (id === me ? handSpot : seatRect(id));
    const out = [];

    if (g.top.id !== p.topId) {
      const mover = g.players.find((x) => (p.counts[x.id] ?? x.count) > x.count);
      let from = mover ? spotFor(mover.id) : deck;
      const lp = lastPlay.current;
      if (mover?.id === me && lp && Date.now() - lp.at < 4000) from = lp.rect;
      if (from) out.push({ key: `p${g.top.id}`, card: g.top, from, to: pile, ms: 430, rot0: -18, rot1: tilt(g.top.id), land: g.top.id });
    }
    for (const x of g.players) {
      const gain = x.count - (p.counts[x.id] ?? x.count);
      const to = gain > 0 ? spotFor(x.id) : null;
      for (let i = 0; i < Math.min(gain, 5) && to; i++) {
        out.push({ key: `d${g.deckCount}-${x.id}-${i}-${Date.now()}`, back: true, from: deck, to, ms: 380, delay: 120 + i * 110, rot0: 0, rot1: 8 });
      }
    }
    if (out.length) {
      setFlights((fl) => [...fl, ...out]);
      const landing = out.find((f) => f.land);
      if (landing) onLand(landing.land, true);
    }
  }, [g, me, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const done = (f) => {
    setFlights((fl) => fl.filter((x) => x.key !== f.key));
    if (f.land) onLand(f.land, false);
  };

  return <div className="flight-layer" aria-hidden="true">{flights.map((f) => <Flight key={f.key} f={f} base={base} onDone={done} />)}</div>;
}
