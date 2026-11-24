import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useSettings } from '../settings.js';
import Icon from '../components/Icon.jsx';

function useCountUp(target, enabled, ms = 900) {
  const [v, setV] = useState(enabled ? 0 : target);
  useEffect(() => {
    if (!enabled) { setV(target); return undefined; }
    let raf; let t0;
    const step = (t) => {
      t0 ??= t;
      const p = Math.min(1, (t - t0) / ms);
      setV(Math.round(target * (1 - (1 - p) ** 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, enabled, ms]);
  return v;
}

function Tile({ label, value, suffix = '', accent, animate, i }) {
  const v = useCountUp(value, animate);
  return (
    <div className={`tile-stat ${accent ?? ''}`} style={{ '--i': i }}>
      <b>{v}{suffix}</b>
      <span>{label}</span>
    </div>
  );
}

function Ring({ pct, animate }) {
  const [shown, setShown] = useState(animate ? 0 : pct);
  useEffect(() => { const t = setTimeout(() => setShown(pct), 60); return () => clearTimeout(t); }, [pct]);
  const C = 2 * Math.PI * 42;
  const count = useCountUp(pct, animate, 1100);
  return (
    <div className="ring" role="img" aria-label={`Win rate ${pct} percent`}>
      <svg viewBox="0 0 100 100" width="132" height="132">
        <circle cx="50" cy="50" r="42" className="ring-bg" />
        <circle cx="50" cy="50" r="42" className="ring-fg" strokeDasharray={`${(shown / 100) * C} ${C}`} transform="rotate(-90 50 50)" />
      </svg>
      <div className="ring-text"><b>{count}%</b><span>win rate</span></div>
    </div>
  );
}

function ordinal(n) {
  if (n == null) return '–';
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th'}`;
}

export default function Stats({ token, onBack, notify }) {
  const { gfx } = useSettings();
  const animate = gfx !== 'low';
  const [data, setData] = useState(null);

  useEffect(() => {
    api('/api/stats/me', { token }).then((res) => {
      if (!res.ok) { notify(res.error || 'Could not load your stats'); setData({ summary: null, recent: [] }); } else setData(res);
    });
  }, [token, notify]);

  const s = data?.summary;
  return (
    <main className="home wideview page">
      <div className="whoami">
        <h2>My stats</h2>
        <span><button className="ghost" onClick={onBack}>Back</button></span>
      </div>

      {!data && <div className="panel skeleton" aria-busy="true"><i /><i /><i /></div>}

      {data && (!s || s.played === 0) && (
        <div className="panel emptystate">
          <Icon name="trophy" size={40} />
          <h3>No finished matches yet</h3>
          <p className="muted">Play a match all the way to 500 points and your stats will show up here.</p>
        </div>
      )}

      {s && s.played > 0 && (
        <>
          <div className="panel statsgrid">
            <Ring pct={s.winRate} animate={animate} />
            <div className="tiles">
              <Tile i={0} label="Matches" value={s.played} animate={animate} />
              <Tile i={1} label="Wins" value={s.wins} accent="gold" animate={animate} />
              <Tile i={2} label="Win streak" value={s.streak} animate={animate} />
              <Tile i={3} label="Avg score" value={s.avgScore} animate={animate} />
              <Tile i={4} label="Best score" value={s.bestScore} animate={animate} />
              <Tile i={5} label="Rounds won" value={s.roundsWon} animate={animate} />
            </div>
          </div>

          <div className="panel">
            <h3>Recent matches</h3>
            <ul className="history">
              {data.recent.map((r, i) => (
                <li key={r.id} style={{ '--i': i }}>
                  <span className={`place p${Math.min(r.placing ?? 9, 4)}`}>{ordinal(r.placing)}</span>
                  <span className="hmain">
                    <b>{r.won ? 'Victory' : `${r.winner ?? 'Someone'} won`}</b>
                    <small>Room {r.roomCode} · {r.players} players · {r.rounds} rounds · {new Date(r.finishedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</small>
                  </span>
                  <span className="hscore">{r.score}<small>pts</small></span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </main>
  );
}
