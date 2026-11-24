import { useMemo } from 'react';
import { useSettings } from '../settings.js';

const COLORS = ['red', 'yellow', 'green', 'blue'];

// Decorative drifting cards behind the menus. Only rendered on High graphics (it is pure decoration).
export default function FloatingCards({ count = 9 }) {
  const { gfx } = useSettings();
  const cards = useMemo(() => Array.from({ length: count }, (_, i) => ({
    color: COLORS[i % 4],
    left: 4 + ((i * 97) % 92),
    size: 46 + ((i * 13) % 34),
    delay: -((i * 5.3) % 22),
    dur: 20 + ((i * 7) % 16),
    rot: ((i * 53) % 70) - 35,
  })), [count]);

  if (gfx !== 'high') return null;
  return (
    <div className="floaters" aria-hidden="true">
      {cards.map((c, i) => (
        <i key={i} className={`floater ${c.color}`}
          style={{ left: `${c.left}%`, width: c.size, height: c.size * 1.5, animationDelay: `${c.delay}s`, animationDuration: `${c.dur}s`, '--rot': `${c.rot}deg` }} />
      ))}
    </div>
  );
}
