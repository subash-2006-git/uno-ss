import SettingsButton from '../components/SettingsModal.jsx';

const TURN_CHOICES = [
  { s: 15, label: '15s' },
  { s: 30, label: '30s' },
  { s: 60, label: '60s' },
  { s: 0, label: 'No limit' },
];

export default function Lobby({ room, me, act, leave }) {
  const isHost = room.hostId === me;
  const { min, max } = room.limits;
  const n = room.members.length;
  const turnSeconds = room.settings?.turnSeconds ?? 30;
  return (
    <main className="home">
      <div className="whoami"><h2>Lobby</h2><SettingsButton /></div>
      <div className="panel">
        <div className="roomcode">
          <small>Room code</small>
          <b>{room.code}</b>
          <button className="ghost" onClick={() => navigator.clipboard?.writeText(room.code)}>Copy</button>
        </div>

        <h3>Players ({n}/{max})</h3>
        <ul className="members">
          {room.members.map((m) => (
            <li key={m.id} className={m.connected ? '' : 'away'}>
              {m.name}{m.id === me ? ' (you)' : ''}{m.id === room.hostId ? ' 👑' : ''}{m.connected ? '' : ' · offline'}
            </li>
          ))}
        </ul>

        <h3>Time per turn</h3>
        {isHost ? (
          <div className="seg">
            {TURN_CHOICES.map((c) => (
              <button key={c.s} className={turnSeconds === c.s ? 'on' : ''} onClick={() => act('set_settings', { turnSeconds: c.s })}>{c.label}</button>
            ))}
          </div>
        ) : <p className="muted">{turnSeconds ? `${turnSeconds} seconds` : 'No limit'}</p>}
        {turnSeconds > 0 && <p className="muted small left">If time runs out the game plays a simple move for you (draw, then pass). Three timeouts in a row removes you from the game.</p>}

        {isHost ? (
          <button className="primary" disabled={n < min} onClick={() => act('start_game')}>
            {n < min ? `Need ${min - n} more player${min - n > 1 ? 's' : ''}` : 'Start game'}
          </button>
        ) : <p className="muted">Waiting for the host to start…</p>}
        <button className="ghost" onClick={leave}>Leave room</button>
      </div>
    </main>
  );
}
