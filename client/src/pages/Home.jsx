import { useEffect, useState } from 'react';
import SettingsButton from '../components/SettingsModal.jsx';
import Logo from '../components/Logo.jsx';
import FloatingCards from '../components/FloatingCards.jsx';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';

export default function Home({ user, act, logout, openAdmin, openStats, notify }) {
  const [code, setCode] = useState('');
  const [board, setBoard] = useState([]);

  useEffect(() => {
    fetch('/api/leaderboard').then((r) => r.json()).then(setBoard).catch(() => {});
  }, []);

  const join = async () => {
    const res = await act('join_room', { code });
    if (res?.ok && res.role === 'spectator') notify('That game is in progress. You are watching, and can ask for a seat.');
  };

  return (
    <main className="home page">
      <FloatingCards />
      <Logo />
      <div className="whoami">
        <span className="me-chip"><Avatar name={user.username} size={30} /> <b>{user.username}</b>{user.isAdmin ? <em className="adminbadge">admin</em> : null}</span>
        <span>
          <SettingsButton />
          <button className="ghost iconbtn" onClick={openStats}><Icon name="chart" /> <span className="hide-sm">My stats</span></button>
          {user.isAdmin && <button className="ghost" onClick={openAdmin}>Manage users</button>}
          <button className="ghost" onClick={logout}>Log out</button>
        </span>
      </div>

      <div className="panel">
        <button className="primary" onClick={() => act('create_room')}>Create room</button>
        <div className="or">or join / watch with a code</div>
        <div className="row">
          <input className="code" value={code} maxLength={5} placeholder="ABCDE"
            onChange={(e) => setCode(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === 'Enter' && code.length === 5 && join()} />
          <button disabled={code.length < 5} onClick={join}>Join</button>
        </div>
        <p className="muted small">Joining a game that already started lets you watch, and play from the next round.</p>
      </div>

      {board.length > 0 && (
        <div className="panel">
          <h3>Leaderboard</h3>
          <ol className="board">
            {board.map((r, i) => (
              <li key={r.id} className={`r${i + 1}`} style={{ '--i': i }}>
                <span className="rank">{i + 1}</span>
                <span className="bname">{r.name}</span>
                <span className="bstat">{r.wins} wins · {r.played ? Math.round((r.wins / r.played) * 100) : 0}%</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </main>
  );
}
