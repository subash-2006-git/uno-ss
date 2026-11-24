import { useEffect, useState } from 'react';

export default function Home({ user, act, logout, openAdmin }) {
  const [code, setCode] = useState('');
  const [board, setBoard] = useState([]);

  useEffect(() => {
    fetch('/api/leaderboard').then((r) => r.json()).then(setBoard).catch(() => {});
  }, []);

  return (
    <main className="home">
      <h1 className="logo">UNO<span>-HUH</span></h1>
      <div className="whoami">
        <span>Playing as <b>{user.username}</b>{user.isAdmin ? ' (admin)' : ''}</span>
        <span>
          {user.isAdmin && <button className="ghost" onClick={openAdmin}>Manage users</button>}
          <button className="ghost" onClick={logout}>Log out</button>
        </span>
      </div>

      <div className="panel">
        <button className="primary" onClick={() => act('create_room')}>Create room</button>
        <div className="or">or join with a code</div>
        <div className="row">
          <input className="code" value={code} maxLength={5} placeholder="ABCDE"
            onChange={(e) => setCode(e.target.value.toUpperCase())} />
          <button disabled={code.length < 5} onClick={() => act('join_room', { code })}>Join</button>
        </div>
      </div>

      {board.length > 0 && (
        <div className="panel">
          <h3>Leaderboard</h3>
          <ol className="board">
            {board.map((r) => <li key={r.id}><span>{r.name}</span><span>{r.wins} wins / {r.played} played</span></li>)}
          </ol>
        </div>
      )}
    </main>
  );
}
