import { useEffect, useRef } from 'react';
import { useCountdown } from '../hooks.js';
import { useSettings } from '../settings.js';
import { play } from '../sound.js';

// Countdown for whoever has to act. `mine` makes it louder (colour + ticking sound in the last 5s).
export default function TurnTimer({ timer, total, mine, name }) {
  const { gfx } = useSettings();
  const left = useCountdown(timer, gfx === 'low' ? 1000 : 250);
  const secs = left == null ? null : Math.ceil(left / 1000);
  const lastTick = useRef(null);

  useEffect(() => {
    if (mine && secs != null && secs <= 5 && secs > 0 && secs !== lastTick.current) play('tick');
    lastTick.current = secs;
  }, [mine, secs]);

  if (left == null) return null;
  const pct = total > 0 ? Math.min(100, (left / Math.max(total, left)) * 100) : 100;
  const urgent = secs <= 5;
  return (
    <div className={`timer ${urgent ? 'urgent' : ''} ${mine ? 'mine' : ''}`} role="timer" aria-label={`${secs} seconds left`}>
      <div className="timerbar"><i style={{ width: `${pct}%` }} /></div>
      <span>{mine ? 'Your time' : name ? `${name}'s time` : 'Time'}: <b>{secs}s</b></span>
    </div>
  );
}
