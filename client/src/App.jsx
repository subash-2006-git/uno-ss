import { useEffect, useRef, useState, useCallback } from 'react';
import { socket, send, loadSession, saveSession, clearSession } from './socket.js';
import { api } from './api.js';
import Auth from './pages/Auth.jsx';
import Home from './pages/Home.jsx';
import Admin from './pages/Admin.jsx';
import Lobby from './pages/Lobby.jsx';
import Game from './pages/Game.jsx';

export default function App() {
  const [session, setSession] = useState(loadSession); // { token, user: { id, username, isAdmin } }
  const [room, setRoom] = useState(null);
  const [view, setView] = useState('home'); // home | admin
  const [online, setOnline] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimer = useRef();
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const notify = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2800);
  }, []);

  // Run a socket action and surface any server-side error.
  const act = useCallback(async (event, payload) => {
    const res = await send(event, payload);
    if (!res?.ok) notify(res?.error || 'Something went wrong');
    return res;
  }, [notify]);

  const dropSession = useCallback(() => { clearSession(); setSession(null); setRoom(null); setView('home'); }, []);

  useEffect(() => {
    const authenticate = async () => {
      const s = sessionRef.current;
      if (!s) return;
      const res = await send('auth', { token: s.token });
      if (!res.ok) dropSession();
    };
    const onConnect = () => { setOnline(true); authenticate(); };
    const onDisconnect = () => setOnline(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room_update', setRoom);
    socket.connect();
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room_update', setRoom);
    };
  }, [dropSession]);

  // After a successful HTTP login: remember the session and sign the socket in.
  const onLoggedIn = async ({ token, user }) => {
    const res = await send('auth', { token });
    if (!res.ok) return notify(res.error);
    const s = { token, user };
    saveSession(s);
    setSession(s);
  };

  const logout = async () => {
    const s = sessionRef.current;
    if (s) await api('/api/logout', { method: 'POST', token: s.token });
    dropSession();
    socket.disconnect();
    socket.connect(); // fresh, unauthenticated socket
  };

  const leave = async () => { await act('leave_room'); setRoom(null); };

  let page;
  if (!session) page = <Auth onLoggedIn={onLoggedIn} />;
  else if (room && (room.status === 'playing' || (room.status === 'finished' && room.game))) {
    page = <Game room={room} me={session.user.id} act={act} leave={leave} />;
  } else if (room) page = <Lobby room={room} me={session.user.id} act={act} leave={leave} />;
  else if (view === 'admin') page = <Admin token={session.token} onBack={() => setView('home')} notify={notify} />;
  else page = <Home user={session.user} act={act} logout={logout} openAdmin={() => setView('admin')} />;

  return (
    <div className="app">
      {!online && <div className="banner">Reconnecting to server…</div>}
      {page}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
