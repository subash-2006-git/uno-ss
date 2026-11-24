import { useState } from 'react';
import { api } from '../api.js';

export default function Auth({ onLoggedIn }) {
  const [mode, setMode] = useState('login'); // login | signup
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState(null); // { kind: 'error' | 'info', text }
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await api(mode === 'login' ? '/api/login' : '/api/signup', {
      method: 'POST', body: { username: username.trim(), password },
    });
    setBusy(false);
    if (mode === 'signup') {
      if (!res.ok) return setMsg({ kind: 'error', text: res.error });
      setMode('login');
      setPassword('');
      return setMsg({ kind: 'info', text: 'Account created! An admin must approve it before you can log in.' });
    }
    if (!res.ok) return setMsg({ kind: res.status === 'pending' ? 'info' : 'error', text: res.error });
    onLoggedIn(res);
  };

  return (
    <main className="home">
      <h1 className="logo">UNO<span>-HUH</span></h1>
      <p className="sub">2-16 players · every player for themselves · first to 500</p>

      <form className="panel" onSubmit={submit}>
        <div className="tabs">
          <button type="button" className={mode === 'login' ? 'on' : ''} onClick={() => { setMode('login'); setMsg(null); }}>Log in</button>
          <button type="button" className={mode === 'signup' ? 'on' : ''} onClick={() => { setMode('signup'); setMsg(null); }}>Sign up</button>
        </div>
        <label>Username
          <input value={username} maxLength={16} autoComplete="username" onChange={(e) => setUsername(e.target.value)} placeholder="3-16 letters, numbers, _" />
        </label>
        <label>Password
          <input type="password" value={password} autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            onChange={(e) => setPassword(e.target.value)} placeholder="at least 8 characters" />
        </label>
        {msg && <p className={`msg ${msg.kind}`}>{msg.text}</p>}
        <button className="primary" disabled={busy || !username || !password}>
          {mode === 'login' ? 'Log in' : 'Request account'}
        </button>
        {mode === 'signup' && <p className="muted small">New accounts need admin approval before you can play.</p>}
      </form>
    </main>
  );
}
