import { useLayoutEffect, useRef, useState } from 'react';

const LABELS = { skip: 'SKIP!', reverse: 'REVERSE!', draw2: '+2', wild4: '+4', wild: 'WILD!' };

// Big "SKIP!" / "REVERSE!" / "+4" / "UNO!" shouts in the middle of the screen when it happens.
export default function Bursts({ g, enabled, onShake }) {
  const prev = useRef(null);
  const [items, setItems] = useState([]);

  useLayoutEffect(() => {
    const p = prev.current;
    prev.current = { topId: g.top.id, round: g.round, counts: Object.fromEntries(g.players.map((x) => [x.id, x.count])),
      uno: Object.fromEntries(g.players.map((x) => [x.id, x.uno])) };
    if (!p || !enabled || p.round !== g.round) return;

    const out = [];
    if (g.top.id !== p.topId && LABELS[g.top.value]) {
      const mover = g.players.find((x) => (p.counts[x.id] ?? x.count) > x.count);
      const wildColor = g.top.color === 'wild' ? g.color : null;
      out.push({ key: `a${g.top.id}`, kind: g.top.value, text: LABELS[g.top.value], sub: [mover?.name, wildColor && `→ ${wildColor}`].filter(Boolean).join(' '), color: wildColor });
      if (g.top.value === 'wild4' || g.top.value === 'draw2') onShake?.();
    }
    for (const x of g.players) {
      if (x.uno && !p.uno[x.id]) out.push({ key: `u${x.id}-${Date.now()}`, kind: 'uno', text: 'UNO!', sub: x.name });
    }
    if (!out.length) return;
    setItems((it) => [...it, ...out]);
    for (const o of out) setTimeout(() => setItems((it) => it.filter((x) => x.key !== o.key)), 1200);
  }, [g, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="burst-layer" aria-hidden="true">
      {items.map((b) => (
        <div key={b.key} className={`burst ${b.kind}`} style={b.color ? { '--bc': `var(--${b.color})` } : undefined}>
          <b>{b.text}</b>
          {b.sub && <small>{b.sub}</small>}
        </div>
      ))}
    </div>
  );
}
