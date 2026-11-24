export default function Lobby({ room, me, act, leave }) {
  const isHost = room.hostId === me;
  const { min, max } = room.limits;
  const n = room.members.length;
  return (
    <main className="home">
      <h2>Lobby</h2>
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
