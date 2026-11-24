import { useEffect, useRef, useState } from 'react';
import { isPlayable } from '@uno/shared';
import Card from '../components/Card.jsx';
import ColorPicker from '../components/ColorPicker.jsx';
import Scoreboard from '../components/Scoreboard.jsx';
import TurnTimer from '../components/TurnTimer.jsx';
import Confetti from '../components/Confetti.jsx';
import SettingsButton from '../components/SettingsModal.jsx';
import ChatButton, { EmoteButton } from '../components/ChatDock.jsx';
import EmoteLayer from '../components/EmoteLayer.jsx';
import Flights from '../components/Flights.jsx';
import Bursts from '../components/Bursts.jsx';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import { useSettings } from '../settings.js';
import { useGameFx, useLatency } from '../hooks.js';
import { play as sfx } from '../sound.js';

// Cards rest on the discard pile at a slightly different angle each, so the pile looks hand-thrown.
const tilt = (id) => ((id * 53) % 17) - 8;
const reducedMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

export default function Game({ room, me, act, leave, chatApi, emotes }) {
  const g = room.game;
  const s = useSettings();
  const [wild, setWild] = useState(null);       // wild card awaiting a colour choice
  const [sel, setSel] = useState(null);         // raised card (tap-twice mode)
  const [hiddenTop, setHiddenTop] = useState(null); // top card hidden while its flight is landing
  const [shake, setShake] = useState(false);
  const lastPlay = useRef(null);                // where my last played card was, so its flight starts there
  const fx = s.gfx !== 'low' && !reducedMotion();

  // Remember the previous top card so the pile shows depth.
  const tops = useRef({ cur: g.top, prev: null });
  if (tops.current.cur.id !== g.top.id) tops.current = { cur: g.top, prev: tops.current.cur };
  const prevTop = tops.current.prev;

  const isSpectator = room.role === 'spectator';
  const nameOf = (id) => g.players.find((p) => p.id === id)?.name ?? '?';
  const myTurn = !isSpectator && g.phase === 'play' && g.turn === me;
  const mustDecide = !isSpectator && g.phase === 'challenge' && g.pending?.challenger === me;
  const mine = g.players.find((p) => p.id === me);
  const isHost = room.hostId === me;
  const hasDrawn = g.drawnCardId != null;
  const over = g.phase === 'roundOver' || g.phase === 'matchOver';
  const actorId = g.phase === 'challenge' ? g.pending?.challenger : g.phase === 'play' ? g.turn : null;
  const ping = useLatency(true, s.gfx === 'low' ? 15000 : 6000);
  const waitingNames = room.waiting.map((id) => room.spectators.find((x) => x.id === id)?.name).filter(Boolean);
  const iAmWaiting = room.waiting.includes(me);

  useGameFx(g, me);
  useEffect(() => { setSel(null); }, [g.top.id, myTurn, g.drawnCardId, g.phase]);

  // Keep the active opponent visible in the scrolling strip (phones).
  useEffect(() => {
    document.querySelector('.opp.turn')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: s.gfx === 'low' ? 'auto' : 'smooth' });
  }, [actorId, s.gfx]);

  const doShake = () => { if (s.gfx === 'high') { setShake(true); setTimeout(() => setShake(false), 480); } };
  const onLand = (id, flying) => setHiddenTop((cur) => (flying ? id : cur === id ? null : cur));

  const canPlay = (c) => myTurn && (!hasDrawn || c.id === g.drawnCardId) && isPlayable(c, g.top, g.color);
  const play = (c, rect) => {
    if (!canPlay(c)) return;
    if (s.confirmTap && sel !== c.id) { setSel(c.id); sfx('select'); return; }
    setSel(null);
    lastPlay.current = { id: c.id, rect, at: Date.now() };
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
  const n = g.hand.length;
  const spread = Math.min(4, 36 / Math.max(n, 1)); // fan angle per card, narrower for big hands

  return (
    <main className={`game ${shake ? 'shake' : ''}`}>
      <header className="topbar">
        <span className="roomtag">
          <Icon name="users" size={16} /> {room.code} <em>· Round {g.round}{g.maxRounds ? ` of ${g.maxRounds}` : ''}{g.maxRounds && g.round === g.maxRounds ? ' (final)' : ''}</em>
          {room.spectators.length > 0 && <span className="watchers" title="Spectators"><Icon name="eye" size={15} /> {room.spectators.length}</span>}
        </span>
        <span className="topright">
          {ping != null && <span className={`conn dot ${quality}`} title={`${ping} ms`}>{ping} ms</span>}
          <EmoteButton act={act} />
          <ChatButton api={chatApi} act={act} />
          <SettingsButton />
          <button className="ghost" onClick={() => (isSpectator || window.confirm('Leave this game?')) && leave()}>Leave</button>
        </span>
      </header>

      {isSpectator && <div className="watchbanner"><Icon name="eye" size={16} /> You are watching. Player hands stay hidden.</div>}

      <section className="opponents">
        {g.players.filter((p) => p.id !== me).map((p) => {
          const active = actorId === p.id;
          return (
            <div key={p.id} data-pid={p.id} className={`opp ${active ? 'turn' : ''}`}>
              <Avatar name={p.name} size={34} />
              <div className="oname">{p.name}</div>
              <div className="ominifan" aria-label={`${p.count} cards`}>
                {Array.from({ length: Math.min(p.count, 6) }, (_, i) => <i key={i} />)}
                <b key={p.count} className="bump">×{p.count}</b>
              </div>
              <div className="oscore">{p.score} pts</div>
              {g.unoVulnId === p.id && !isSpectator && <button className="catch" onClick={() => act('catch_uno')}>Catch!</button>}
              {p.count === 1 && (g.unoVulnId !== p.id || isSpectator) && <span className="unotag">UNO</span>}
            </div>
          );
        })}
      </section>

      <section className={`table ${myTurn ? 'mine' : ''}`} style={{ '--cur': `var(--${g.color})` }}>
        <div className="stage">
          <div className="dirring" data-dir={g.dir} aria-hidden="true" />
          <div className="piles">
            <div className="pile">
              <button className={`drawpile ${myTurn && !hasDrawn ? 'ready' : ''}`} disabled={!myTurn || hasDrawn} onClick={() => act('draw_card')} aria-label="Draw a card">
                <Card back />
              </button>
              <small>{g.deckCount} left</small>
            </div>
            <div className="pile">
              <div className="discard">
                {prevTop && <div className="under" style={{ '--tilt': `${tilt(prevTop.id)}deg` }}><Card card={prevTop} /></div>}
                <div key={g.top.id} className="topcard" style={{ '--tilt': `${tilt(g.top.id)}deg`, visibility: hiddenTop === g.top.id ? 'hidden' : undefined }}>
                  <Card card={g.top} />
                </div>
              </div>
              <div key={g.color} className="colorchip" style={{ '--c': `var(--${g.color})` }}>{g.color}</div>
            </div>
          </div>
        </div>
        <p className={`status ${myTurn || mustDecide ? 'you' : ''}`}>{status}</p>
        {waitingNames.length > 0 && <p className="chip joining"><Icon name="users" size={14} /> Joining next round: {waitingNames.join(', ')}</p>}
        {room.timer && g.phase !== 'roundOver' && g.phase !== 'matchOver' && (
          <TurnTimer timer={room.timer} total={room.settings.turnSeconds * 1000} mine={myTurn || mustDecide} name={actorId ? nameOf(actorId) : ''} />
        )}
        {s.gfx !== 'low' && <ul className="log">{g.log.map((l, i) => <li key={i}>{l}</li>)}</ul>}
      </section>

      {isSpectator ? (
        <section className="me spectate" data-pid={me}>
          {iAmWaiting ? (
            <>
              <span className="chip joining">You will be dealt in next round</span>
              <button className="ghost" onClick={() => act('cancel_seat')}>Cancel</button>
            </>
          ) : room.seatsFree > 0 ? (
            <button className="primary" onClick={() => act('request_seat')}>{g.phase === 'matchOver' ? 'Play the next game' : 'Join next round'}</button>
          ) : <span className="muted">The table is full</span>}
        </section>
      ) : (
        <section className="me" data-pid={me}>
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
            {g.hand.map((c, i) => {
              const d = i - (n - 1) / 2;
              return (
                <Card key={c.id} card={c} enter selected={sel === c.id} playable={canPlay(c)} dim={myTurn && !canPlay(c)}
                  style={{ '--rot': `${d * spread}deg`, '--ty': `${Math.round(d * d * 0.7)}px` }}
                  onClick={(e) => play(c, e.currentTarget.getBoundingClientRect())} />
              );
            })}
          </div>
        </section>
      )}

      {wild && (
        <ColorPicker
          onCancel={() => setWild(null)}
          onPick={(color) => { act('play_card', { cardId: wild.id, color }); setWild(null); }}
        />
      )}

      <Flights g={g} me={me} lastPlay={lastPlay} enabled={fx} tilt={tilt} onLand={onLand} />
      <Bursts g={g} enabled={fx} onShake={doShake} />
      <EmoteLayer emotes={emotes} />

      {over && s.gfx !== 'low' && <Confetti count={s.gfx === 'high' ? 50 : 18} />}
      {over && (
        <div className="modal-bg">
          <div className="modal wide">
            <span className="trophy"><Icon name="trophy" size={44} /></span>
            {g.phase === 'matchOver' ? (
              <h2>{nameOf(g.winnerId)} wins the match!</h2>
            ) : (
              <>
                <h2>{nameOf(g.roundResult.winnerId)} wins the round</h2>
                <p className="points">+{g.roundResult.points} points</p>
              </>
            )}
            <Scoreboard players={g.players} target={g.maxRounds ? Math.max(1, ...g.players.map((p) => p.score)) : room.limits.target} meId={me} />
            {g.phase === 'roundOver' && (
              <p className="muted small">
                {g.maxRounds
                  ? (g.round === g.maxRounds - 1 ? 'The next round is the final round' : `${g.maxRounds - g.round} rounds to go`)
                  : `First to ${room.limits.target} points wins`}
              </p>
            )}
            {g.phase === 'roundOver' && waitingNames.length > 0 && <p className="chip joining">Joining now: {waitingNames.join(', ')}</p>}
            {g.phase === 'roundOver' && !isSpectator && <button className="primary" onClick={() => act('next_round')}>Next round</button>}
            {g.phase === 'roundOver' && isSpectator && (
              <>
                <p className="muted">Waiting for a player to start the next round…</p>
                <button className="ghost" onClick={leave}>Leave</button>
              </>
            )}
            {g.phase === 'matchOver' && isHost && <button className="primary" onClick={() => act('rematch')}>Back to lobby</button>}
            {g.phase === 'matchOver' && !isHost && <p className="muted">Waiting for the host…</p>}
            {g.phase === 'matchOver' && <button className="ghost" onClick={leave}>Leave</button>}
          </div>
        </div>
      )}
    </main>
  );
}
