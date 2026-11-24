import { EMOTES } from '../emotes.js';

// Floating reaction bubbles. Each one is anchored to the sender's seat (any element with data-pid).
export default function EmoteLayer({ emotes }) {
  return (
    <div className="emote-layer" aria-hidden="true">
      {emotes.map((e) => {
        const el = document.querySelector(`[data-pid="${CSS.escape(e.pid)}"]`);
        const r = el?.getBoundingClientRect();
        const x = r ? r.left + r.width / 2 : window.innerWidth / 2;
        const y = r ? r.top + r.height / 2 : window.innerHeight * 0.4; // centred on the seat, then drifts up
        return <span key={e.key} className="emote-bubble" style={{ left: x, top: y }}>{EMOTES[e.emote]}</span>;
      })}
    </div>
  );
}
