import { useEffect, useRef, useState, useCallback } from 'react';
import { socket, send, loadSession, saveSession, clearSession } from './socket.js';
import { api } from './api.js';
import { play } from './sound.js';
import Auth from './pages/Auth.jsx';
import Home from './pages/Home.jsx';
import Admin from './pages/Admin.jsx';
import Stats from './pages/Stats.jsx';
import Lobby from './pages/Lobby.jsx';
import Game from './pages/Game.jsx';

export default function App() {
  const [session, setSession] = useState(loadSession); // { token, user: { id, username, isAdmin } }
  const [room, setRoom] = useState(null);
  const [view, setView] = useState('home'); // home | admin | stats | profile
  const [profileId, setProfileId] = useState(null);
  const [rejoin, setRejoin] = useState(null);       // code of a running game that is holding my seat
  const [adminInfo, setAdminInfo] = useState({ pending: 0, tick: 0 }); // admins: accounts waiting + a counter that triggers reloads
  const [chat, setChat] = useState([]);       // text messages for the current room
  const [emotes, setEmotes] = useState([]);   // reaction bubbles currently floating
  const [chatOpen, setChatOpenState] = useState(false);
  const [unread, setUnread] = useState(0);
  const chatOpenRef = useRef(false);
  const setChatOpen = (open) => { chatOpenRef.current = open; setChatOpenState(open); if (open) setUnread(0); };
  const [online, setOnline] = useState(false);
  const [replaced, setReplaced] = useState(false); // this account was opened in another tab/device
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
    if (!res?.ok) { notify(res?.error || 'Something went wrong'); play('error'); }
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
    const onConnect = () => { setOnline(true); setReplaced(false); authenticate(); };
    // 'io server disconnect' = the server closed us on purpose (same account signed in somewhere else).
    // (not when we are logged out: e.g. after a suspension the server also closes the connection)
    const onDisconnect = (reason) => { setOnline(false); if (reason === 'io server disconnect' && sessionRef.current) setReplaced(true); };
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    const onKicked = ({ message }) => { setRoom(null); notify(message || 'You were removed from the game'); };
    const onHistory = (list) => setChat(Array.isArray(list) ? list : []);
    const onMsg = (m) => {
      const mine = m.pid === sessionRef.current?.user.id;
      if (m.kind === 'text') {
        setChat((c) => [...c.slice(-59), m]);
        if (!mine) { play('pop'); if (!chatOpenRef.current) setUnread((u) => u + 1); }
      } else {
        setEmotes((e) => [...e.filter((x) => x.pid !== m.pid), { key: m.id, pid: m.pid, emote: m.emote }]); // one bubble per sender
        if (!mine) play('pop');
        setTimeout(() => setEmotes((e) => e.filter((x) => x.key !== m.id)), 2800);
      }
    };
    const onRejoin = ({ code }) => setRejoin(code ?? null);
    const onPending = ({ pending, newUser }) => {
      setAdminInfo((a) => ({ pending, tick: a.tick + 1 }));
      if (newUser) { notify(`${newUser} asked for an account`); play('pop'); }
    };
    const onSuspended = ({ message }) => { dropSession(); notify(message || 'Your account was suspended'); };
    socket.on('room_update', setRoom);
    socket.on('kicked', onKicked);
    socket.on('chat_history', onHistory);
    socket.on('chat_msg', onMsg);
    socket.on('rejoin_info', onRejoin);
    socket.on('admin_pending', onPending);
    socket.on('suspended', onSuspended);
    socket.connect();
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room_update', setRoom);
      socket.off('kicked', onKicked);
      socket.off('chat_history', onHistory);
      socket.off('chat_msg', onMsg);
      socket.off('rejoin_info', onRejoin);
      socket.off('admin_pending', onPending);
      socket.off('suspended', onSuspended);
    };
  }, [dropSession, notify]);

  // Leaving a room (or being removed) clears its chat.
  useEffect(() => {
    if (room) return;
    setChat([]); setUnread(0); setChatOpenState(false); chatOpenRef.current = false;
  }, [room]);

  // After a successful HTTP login: remember the session and sign the socket in.
  const onLoggedIn = async ({ token, user }) => {
    if (!socket.connected) { // the server may have closed our connection (e.g. after a suspension): reconnect first
      socket.connect();
      await new Promise((resolve) => { const t = setTimeout(resolve, 5000); socket.once('connect', () => { clearTimeout(t); resolve(); }); });
    }
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

  const chatApi = { chat, unread, open: chatOpen, setOpen: setChatOpen, meId: session?.user.id };

  let page;
  if (!session) page = <Auth onLoggedIn={onLoggedIn} />;
  else if (room && (room.status === 'playing' || (room.status === 'finished' && room.game))) {
    page = <Game room={room} me={session.user.id} act={act} leave={leave} chatApi={chatApi} emotes={emotes} />;
  } else if (room) page = <Lobby room={room} me={session.user.id} act={act} leave={leave} chatApi={chatApi} emotes={emotes} />;
  else if (view === 'admin') page = <Admin token={session.token} tick={adminInfo.tick} onBack={() => setView('home')} notify={notify} />;
  else if (view === 'stats') page = <Stats token={session.token} onBack={() => setView('home')} notify={notify} />;
  else if (view === 'profile') page = <Stats token={session.token} userId={profileId} onBack={() => setView('home')} notify={notify} />;
  else {
    page = (
      <Home user={session.user} act={act} logout={logout} notify={notify} rejoin={rejoin} clearRejoin={() => setRejoin(null)} pending={adminInfo.pending}
        openAdmin={() => setView('admin')} openStats={() => setView('stats')} openProfile={(id) => { setProfileId(id); setView('profile'); }} />
    );
  }

  return (
    <div className="app">
      {replaced && (
        <div className="banner">
          This account is open in another tab or device.
          <button onClick={() => { setReplaced(false); socket.connect(); }}>Use this tab</button>
        </div>
      )}
      {!online && !replaced && <div className="banner">Reconnecting to server…</div>}
      {page}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
