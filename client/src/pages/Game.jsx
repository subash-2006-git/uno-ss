import { useEffect, useState } from 'react';
import { isPlayable } from '@uno/shared';
import Card from '../components/Card.jsx';
import ColorPicker from '../components/ColorPicker.jsx';
import Scoreboard from '../components/Scoreboard.jsx';
import TurnTimer from '../components/TurnTimer.jsx';
import Confetti from '../components/Confetti.jsx';
import SettingsButton from '../components/SettingsModal.jsx';
import { useSettings } from '../settings.js';
import { useGameFx, useLatency } from '../hooks.js';
import { play as sfx } from '../sound.js';

export default function Game({ room, me, act, leave }) {
  const g = room.game;
  const s = useSettings();
  const [wild, setWild] = useState(null); // wild card awaiting a colour choice
  const [sel, setSel] = useState(null);   // raised card (tap-twice mode)

  const nameOf = (id) => g.players.find((p) => p.id === id)?.name ?? '?';
  const myTurn = g.phase === 'play' && g.turn === me;
  const mustDecide = g.phase === 'challenge' && g.pending?.challenger === me;
  const mine = g.players.find((p) => p.id === me);
  const isHost = room.hostId === me;
  const hasDrawn = g.drawnCardId != null;
  const over = g.phase === 'roundOver' || g.phase === 'matchOver';
  const actorId = g.phase === 'challenge' ? g.pending?.challenger : g.phase === 'play' ? g.turn : null;
  const ping = useLatency(true, s.gfx === 'low' ? 15000 : 6000);

  useGameFx(g, me);
  useEffect(() => { setSel(null); }, [g.top.id, myTurn, g.drawnCardId, g.phase]);

  // Keep the active opponent visible in the scrolling strip (phones).
  useEffect(() => {
    document.querySelector('.opp.turn')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: s.gfx === 'low' ? 'auto' : 'smooth' });
  }, [actorId, s.gfx]);

  const canPlay = (c) => myTurn && (!hasDrawn || c.id === g.drawnCardId) && isPlayable(c, g.top, g.color);
  const play = (c) => {
    if (!canPlay(c)) return;
    if (s.confirmTap && sel !== c.id) { setSel(c.id); sfx('select'); return; }
    setSel(null);
    if (c.color === 'wild') setWild(c);
    else act('play_card', { cardId: c.id });
  };

  let status;
  if (g.phase === 'challenge') {
    status = mustDecide
      ? `${nameOf(g.pending.offender)} played Wild Draw Four. Challenge it or draw 4.`
      : `${nameOf(g.pending.challenger)} is deciding on the Wild Draw Four…`;
  } else if (over) status = '';
  else if (myTurn) status = hasDrawn ? 'Play the drawn card or pass' : 'Your turn';
  else status = `${nameOf(g.turn)}'s turn`;

  const quality = ping == null ? '' : ping < 120 ? 'good' : ping < 350 ? 'ok' : 'slow';

  return (
    <main className="game">
      <header className="topbar">
        <span>Room {room.code} · Round {g.round}</span>
        <span className="topright">
          {ping != null && <span className={`conn dot ${quality}`} title={`${ping} ms`}>{ping} ms</span>}
          <SettingsButton />
          <button className="ghost" onClick={() => window.confirm('Leave this game?') && leave()}>Leave</button>
        </span>
      </header>

      <section className="opponents">
        {g.players.filter((p) => p.id !== me).map((p) => {
          const active = actorId === p.id;
          return (
            <div key={p.id} className={`opp ${active ? 'turn' : ''}`}>
              <div className="oname">{p.name}</div>
              <div className="ocards"><Card back small /> <b>×{p.count}</b></div>
              <div className="oscore">{p.score} pts</div>
              {g.unoVulnId === p.id && <button className="catch" onClick={() => act('catch_uno')}>Catch!</button>}
              {p.count === 1 && g.unoVulnId !== p.id && <span className="unotag">UNO</span>}
            </div>
          );
        })}
      </section>

      <section className="table">
        <div className="piles">
          <div className="pile">
            <button className="drawpile" disabled={!myTurn || hasDrawn} onClick={() => act('draw_card')}>
              <Card back />
            </button>
            <small>{g.deckCount} left</small>
          </div>
          <div className="pile">
            <div key={g.top.id} className="topcard"><Card card={g.top} /></div>
            <div key={g.color} className="colorchip" style={{ '--c': `var(--${g.color})` }}>{g.color}</div>
          </div>
        </div>
        <p className="status">{status} <span className="dir">{g.dir === 1 ? '↻' : '↺'}</span></p>
        {room.timer && g.phase !== 'roundOver' && g.phase !== 'matchOver' && (
          <TurnTimer timer={room.timer} total={room.settings.turnSeconds * 1000} mine={myTurn || mustDecide} name={actorId ? nameOf(actorId) : ''} />
        )}
        {s.gfx !== 'low' && <ul className="log">{g.log.map((l, i) => <li key={i}>{l}</li>)}</ul>}
      </section>

      <section className="me">
        <div className="actions">
          {mustDecide && (
            <>
              <button className="primary" onClick={() => act('challenge', { accept: false })}>Challenge!</button>
              <button onClick={() => act('challenge', { accept: true })}>Draw 4</button>
            </>
          )}
          {myTurn && hasDrawn && <button onClick={() => act('pass_turn')}>Pass</button>}
          {mine && mine.count > 0 && mine.count <= 2 && !mine.uno && !over && (
            <button className="uno" onClick={() => act('call_uno')}>UNO!</button>
          )}
          {g.unoVulnId === me && <span className="warn">Say UNO!</span>}
          {myTurn && s.confirmTap && !hasDrawn && !sel && <span className="muted small">Tap a card to select, tap again to play</span>}
        </div>
        <div className="hand">
          {g.hand.map((c) => (
            <Card key={c.id} card={c} enter selected={sel === c.id} playable={canPlay(c)} dim={myTurn && !canPlay(c)} onClick={() => play(c)} />
          ))}
        </div>
      </section>

      {wild && (
        <ColorPicker
          onCancel={() => setWild(null)}
          onPick={(color) => { act('play_card', { cardId: wild.id, color }); setWild(null); }}
        />
      )}

      {over && s.gfx !== 'low' && <Confetti count={s.gfx === 'high' ? 50 : 18} />}
      {over && (
        <div className="modal-bg">
          <div className="modal wide">
            {g.phase === 'matchOver' ? (
              <h2>🏆 {nameOf(g.winnerId)} wins the match!</h2>
            ) : (
              <>
                <h2>{nameOf(g.roundResult.winnerId)} wins the round</h2>
                <p>+{g.roundResult.points} points</p>
              </>
            )}
            <Scoreboard players={g.players} target={room.limits.target} meId={me} />
            {g.phase === 'roundOver' && <button className="primary" onClick={() => act('next_round')}>Next round</button>}
            {g.phase === 'matchOver' && isHost && <button className="primary" onClick={() => act('rematch')}>Back to lobby</button>}
            {g.phase === 'matchOver' && !isHost && <p className="muted">Waiting for the host…</p>}
            {g.phase === 'matchOver' && <button className="ghost" onClick={leave}>Leave</button>}
          </div>
        </div>
      )}
    </main>
  );
}
