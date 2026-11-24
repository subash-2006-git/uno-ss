import { useState } from 'react';
import { isPlayable } from '@uno/shared';
import Card from '../components/Card.jsx';
import ColorPicker from '../components/ColorPicker.jsx';
import Scoreboard from '../components/Scoreboard.jsx';

export default function Game({ room, me, act, leave }) {
  const g = room.game;
  const [wild, setWild] = useState(null); // wild card awaiting a colour choice
  const nameOf = (id) => g.players.find((p) => p.id === id)?.name ?? '?';
  const myTurn = g.phase === 'play' && g.turn === me;
  const mustDecide = g.phase === 'challenge' && g.pending?.challenger === me;
  const mine = g.players.find((p) => p.id === me);
  const isHost = room.hostId === me;
  const hasDrawn = g.drawnCardId != null;
  const over = g.phase === 'roundOver' || g.phase === 'matchOver';

  const canPlay = (c) => myTurn && (!hasDrawn || c.id === g.drawnCardId) && isPlayable(c, g.top, g.color);
  const play = (c) => {
    if (!canPlay(c)) return;
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

  return (
    <main className="game">
      <header className="topbar">
        <span>Room {room.code} · Round {g.round}</span>
        <button className="ghost" onClick={() => window.confirm('Leave this game?') && leave()}>Leave</button>
      </header>

      <section className="opponents">
        {g.players.filter((p) => p.id !== me).map((p) => {
          const active = (g.phase === 'play' && g.turn === p.id) || g.pending?.challenger === p.id;
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
            <Card card={g.top} />
            <div className="colorchip" style={{ '--c': `var(--${g.color})` }}>{g.color}</div>
          </div>
        </div>
        <p className="status">{status} <span className="dir">{g.dir === 1 ? '↻' : '↺'}</span></p>
        <ul className="log">{g.log.map((l, i) => <li key={i}>{l}</li>)}</ul>
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
        </div>
        <div className="hand">
          {g.hand.map((c) => (
            <Card key={c.id} card={c} playable={canPlay(c)} dim={myTurn && !canPlay(c)} onClick={() => play(c)} />
          ))}
        </div>
      </section>

      {wild && (
        <ColorPicker
          onCancel={() => setWild(null)}
          onPick={(color) => { act('play_card', { cardId: wild.id, color }); setWild(null); }}
        />
      )}

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
