import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// "Maya draws 4" popups next to whoever just took a penalty (Draw Two / Wild Draw Four / forgetting to say UNO).
// A plain draw is one card; penalties are two or more at once, so that is what we announce.
export default function Penalties({ g, me, enabled }) {
  const prev = useRef(null);
  const [items, setItems] = useState([]);

  useLayoutEffect(() => {
    const p = prev.current;
    prev.current = { round: g.round, counts: Object.fromEntries(g.players.map((x) => [x.id, x.count])) };
    if (!p || p.round !== g.round) return;
    const out = [];
    for (const x of g.players) {
      const gain = x.count - (p.counts[x.id] ?? x.count);
      if (gain >= 2) out.push({ key: `${x.id}-${Date.now()}-${gain}`, pid: x.id, gain, text: x.id === me ? `You draw ${gain}` : `${x.name} draws ${gain}` });
    }
    if (!out.length) return;
    setItems((it) => [...it, ...out]);
    for (const o of out) setTimeout(() => setItems((it) => it.filter((i) => i.key !== o.key)), enabled ? 2600 : 2200);
  }, [g]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!items.length) return null;
  return createPortal(
    <div className="penalty-layer" aria-live="polite">
      {items.map((o) => {
        const el = document.querySelector(`[data-pid="${CSS.escape(o.pid)}"]`);
        const r = el?.getBoundingClientRect();
        const x = r ? r.left + r.width / 2 : window.innerWidth / 2;
        const y = r ? (o.pid === me ? r.top : r.bottom) : window.innerHeight * 0.3;
        return (
          <span key={o.key} className={`penalty ${o.pid === me ? 'mine' : ''}`} style={{ left: x, top: y }}>
            <b>+{o.gain}</b> {o.text}
          </span>
        );
      })}
    </div>,
    document.body,
  );
}
