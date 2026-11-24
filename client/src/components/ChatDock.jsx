import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { EMOTES, EMOTE_LABELS, nameColor } from '../emotes.js';

export function EmoteBar({ act }) {
  return (
    <div className="emotebar" role="group" aria-label="Quick reactions">
      {Object.entries(EMOTES).map(([id, ch]) => (
        <button key={id} className="emote" onClick={() => act('emote', { emote: id })} aria-label={EMOTE_LABELS[id]}>{ch}</button>
      ))}
    </div>
  );
}

// One-tap reactions in a little popover (for the game top bar).
export function EmoteButton({ act }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="emotepop">
      <button className="ghost iconbtn" onClick={() => setOpen((o) => !o)} aria-label="Send a reaction" aria-expanded={open} title="Reactions">
        <Icon name="smile" />
      </button>
      {open && (
        <div className="popover" onClick={() => setOpen(false)}>
          <EmoteBar act={act} />
        </div>
      )}
    </span>
  );
}

// Chat toggle button with an unread badge, plus the drawer itself.
export default function ChatButton({ api, act }) {
  const { chat, open, setOpen, unread, meId } = api;
  const [text, setText] = useState('');
  const list = useRef(null);

  useEffect(() => {
    if (open) list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [open, chat.length]);

  const submit = async (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText('');
    const res = await act('chat', { text: t });
    if (!res.ok) setText(t); // keep the draft if it was rejected (e.g. sent too fast)
  };

  return (
    <>
      <button className="ghost iconbtn chatbtn" onClick={() => setOpen(!open)} aria-label="Chat" aria-expanded={open} title="Chat">
        <Icon name="chat" />
        {unread > 0 && <span className="badge-dot">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <aside className="chat-drawer" role="dialog" aria-label="Chat">
          <header>
            <h3>Chat</h3>
            <button className="ghost iconbtn" onClick={() => setOpen(false)} aria-label="Close chat"><Icon name="close" /></button>
          </header>
          <ul className="msgs" ref={list}>
            {chat.length === 0 && <li className="empty">No messages yet. Say hi!</li>}
            {chat.map((m) => (
              <li key={m.id} className={m.pid === meId ? 'mine' : ''}>
                <span className="who" style={{ color: nameColor(m.name) }}>{m.name}{m.spectator && <em> (watching)</em>}</span>
                <span className="txt">{m.text}</span>
              </li>
            ))}
          </ul>
          <EmoteBar act={act} />
          <form onSubmit={submit}>
            <input value={text} maxLength={120} onChange={(e) => setText(e.target.value)} placeholder="Say something…" aria-label="Message" autoComplete="off" />
            <button className="primary iconbtn" disabled={!text.trim()} aria-label="Send"><Icon name="send" /></button>
          </form>
        </aside>
      )}
    </>
  );
}
