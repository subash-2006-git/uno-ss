import { useEffect, useState } from 'react';
import SettingsButton from '../components/SettingsModal.jsx';
import Logo from '../components/Logo.jsx';
import FloatingCards from '../components/FloatingCards.jsx';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';

export default function Home({ user, act, logout, openAdmin, openStats, openProfile, notify, rejoin, clearRejoin, pending }) {
  const [code, setCode] = useState('');
  const [board, setBoard] = useState([]);

  useEffect(() => {
    fetch('/api/leaderboard').then((r) => r.json()).then(setBoard).catch(() => {});
  }, []);

  const join = async () => {
    const res = await act('join_room', { code });
    if (res?.ok && res.role === 'spectator') notify('That game is in progress. You are watching, and can ask for a seat.');
  };

  const takeSeatBack = async () => {
    const res = await act('join_room', { code: rejoin });
    if (!res?.ok) clearRejoin(); // the game is over or the room is gone
  };

  return (
    <main className="home page">
      <FloatingCards />
      <Logo />
      <div className="whoami">
        <span className="me-chip"><Avatar name={user.username} size={30} /> <b>{user.username}</b>{user.isAdmin ? <em className="adminbadge">admin</em> : null}</span>
        <span>
          <SettingsButton />
          <button className="ghost iconbtn" onClick={openStats} aria-label="My stats"><Icon name="chart" /> <span className="hide-sm">My stats</span></button>
          {user.isAdmin && (
            <button className="ghost iconbtn" onClick={openAdmin}>
              Manage users{pending > 0 && <span className="badge-inline">{pending}</span>}
            </button>
          )}
          <button className="ghost" onClick={logout}>Log out</button>
        </span>
      </div>

      {rejoin && (
        <div className="panel rejoin" role="status">
          <div>
            <b>A game is holding your seat</b>
            <p className="muted small left">You left room {rejoin} while it was running. A bot is playing for you until you come back.</p>
          </div>
          <button className="primary" onClick={takeSeatBack}>Rejoin game</button>
        </div>
      )}

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
                <button className="boardrow" onClick={() => openProfile(r.id)} aria-label={`Open ${r.name}'s profile`}>
                  <span className="rank">{i + 1}</span>
                  <span className="bname">{r.name}</span>
                  <span className="bstat">{r.wins} wins · {r.played ? Math.round((r.wins / r.played) * 100) : 0}%</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </main>
  );
}
