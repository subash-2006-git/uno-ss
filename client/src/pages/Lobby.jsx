import SettingsButton from '../components/SettingsModal.jsx';
import FloatingCards from '../components/FloatingCards.jsx';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import ChatButton, { EmoteButton } from '../components/ChatDock.jsx';
import EmoteLayer from '../components/EmoteLayer.jsx';

const TURN_CHOICES = [
  { s: 15, label: '15s' },
  { s: 30, label: '30s' },
  { s: 60, label: '60s' },
  { s: 0, label: 'No limit' },
];

export default function Lobby({ room, me, act, leave, chatApi, emotes }) {
  const isHost = room.hostId === me;
  const isSpectator = room.role === 'spectator';
  const { min, max } = room.limits;
  const n = room.members.length;
  const turnSeconds = room.settings?.turnSeconds ?? 30;
  return (
    <main className="home page">
      <FloatingCards count={6} />
      <div className="whoami">
        <h2>Lobby</h2>
        <span><EmoteButton act={act} /><ChatButton api={chatApi} act={act} /><SettingsButton /></span>
      </div>
      <div className="panel">
        <div className="roomcode">
          <small>Room code</small>
          <b>{room.code}</b>
          <button className="ghost iconbtn" onClick={() => navigator.clipboard?.writeText(room.code)}><Icon name="copy" /> Copy</button>
        </div>

        <h3>Players ({n}/{max})</h3>
        <ul className="members">
          {room.members.map((m, i) => (
            <li key={m.id} data-pid={m.id} className={m.connected ? '' : 'away'} style={{ '--i': i }}>
              <Avatar name={m.name} size={30} />
              <span className="mname">{m.name}{m.id === me ? ' (you)' : ''}</span>
              {m.id === room.hostId && <span className="host" title="Host"><Icon name="crown" size={16} /></span>}
              {!m.connected && <em className="offline">offline</em>}
            </li>
          ))}
        </ul>

        {room.spectators.length > 0 && (
          <div className="watchers-list">
            <h4><Icon name="eye" size={14} /> Watching ({room.spectators.length})</h4>
            <p>{room.spectators.map((s) => (
              <span key={s.id} data-pid={s.id} className="chip">{s.name}{s.id === me ? ' (you)' : ''}</span>
            ))}</p>
          </div>
        )}

        <h3>Time per turn</h3>
        {isHost ? (
          <div className="seg">
            {TURN_CHOICES.map((c) => (
              <button key={c.s} className={turnSeconds === c.s ? 'on' : ''} onClick={() => act('set_settings', { turnSeconds: c.s })}>{c.label}</button>
            ))}
          </div>
        ) : <p className="muted">{turnSeconds ? `${turnSeconds} seconds` : 'No limit'}</p>}
        {turnSeconds > 0 && <p className="muted small left">If time runs out the game plays a simple move for you (draw, then pass). Three timeouts in a row removes you from the game.</p>}

        {isSpectator && (
          room.seatsFree > 0
            ? <button className="primary" onClick={() => act('request_seat')}>Take a seat</button>
            : <p className="muted">The table is full. You are watching.</p>
        )}
        {isHost && (
          <button className="primary" disabled={n < min} onClick={() => act('start_game')}>
            {n < min ? `Need ${min - n} more player${min - n > 1 ? 's' : ''}` : 'Start game'}
          </button>
        )}
        {!isHost && !isSpectator && <p className="muted">Waiting for the host to start…</p>}
        <button className="ghost" onClick={leave}>Leave room</button>
      </div>
      <EmoteLayer emotes={emotes} />
    </main>
  );
}
