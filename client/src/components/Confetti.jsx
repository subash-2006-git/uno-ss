import { useMemo } from 'react';

const COLORS = ['#e53935', '#f9c22e', '#2e9e4f', '#1e6fd9', '#ffffff'];

// Pure-CSS confetti (no canvas, no images). Parent decides whether to render it based on graphics quality.
export default function Confetti({ count = 40 }) {
  const bits = useMemo(() => Array.from({ length: count }, (_, i) => ({
    left: Math.random() * 100,
    delay: Math.random() * 1.2,
    dur: 2.2 + Math.random() * 2,
    size: 6 + Math.random() * 7,
    color: COLORS[i % COLORS.length],
    spin: Math.random() * 720 - 360,
  })), [count]);

  return (
    <div className="confetti" aria-hidden="true">
      {bits.map((b, i) => (
        <i key={i} style={{
          left: `${b.left}%`, width: b.size, height: b.size * 1.6, background: b.color,
          animationDelay: `${b.delay}s`, animationDuration: `${b.dur}s`, '--spin': `${b.spin}deg`,
        }} />
      ))}
    </div>
  );
}
