import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';

const ORDER = { pending: 0, approved: 1, rejected: 2 };

export default function Admin({ token, onBack, notify }) {
  const [users, setUsers] = useState(null);
  const [resetFor, setResetFor] = useState(null); // user id with the reset box open
  const [newPw, setNewPw] = useState('');

  const load = useCallback(async () => {
    const res = await api('/api/admin/users', { token });
    if (!res.ok) return notify(res.error || 'Could not load users');
    setUsers(res.users);
  }, [token, notify]);

  useEffect(() => { load(); }, [load]);

  const run = async (id, action, body, okMsg) => {
    const res = await api(`/api/admin/users/${id}/${action}`, { method: 'POST', token, body });
    if (!res.ok) return notify(res.error || 'Failed');
    notify(okMsg);
    setResetFor(null);
    setNewPw('');
    load();
  };

  const sorted = [...(users ?? [])].sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.username.localeCompare(b.username));
  const pending = sorted.filter((u) => u.status === 'pending').length;

  return (
    <main className="home wideview">
      <div className="whoami">
        <h2>Users {pending > 0 && <span className="badge">{pending} pending</span>}</h2>
        <span>
          <button className="ghost" onClick={load}>Refresh</button>
          <button className="ghost" onClick={onBack}>Back</button>
        </span>
      </div>

      <div className="panel">
        {users === null && <p className="muted">Loading…</p>}
        {users?.length === 0 && <p className="muted">No users yet.</p>}
        <ul className="users">
          {sorted.map((u) => (
            <li key={u.id}>
              <div className="urow">
                <Avatar name={u.username} size={28} />
                <span className="uname">{u.username}{u.isAdmin && <span className="host"><Icon name="crown" size={15} /></span>}</span>
                <span className={`pill ${u.status}`}>{u.status}</span>
                <span className="uactions">
                  {u.status !== 'approved' && <button className="primary" onClick={() => run(u.id, 'approve', undefined, `${u.username} approved`)}>Approve</button>}
                  {u.status === 'pending' && <button onClick={() => run(u.id, 'reject', undefined, `${u.username} rejected`)}>Reject</button>}
                  <button className="ghost" onClick={() => { setResetFor(resetFor === u.id ? null : u.id); setNewPw(''); }}>Reset password</button>
                </span>
              </div>
              {resetFor === u.id && (
                <form className="row resetrow" onSubmit={(e) => { e.preventDefault(); run(u.id, 'reset-password', { password: newPw }, `Password reset for ${u.username}`); }}>
                  <input type="text" value={newPw} placeholder="New password (min 8 chars)" onChange={(e) => setNewPw(e.target.value)} autoFocus />
                  <button className="primary" disabled={newPw.length < 8}>Set</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
