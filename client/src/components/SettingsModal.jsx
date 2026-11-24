import { useState } from 'react';
import { updateSettings, useSettings } from '../settings.js';
import { play } from '../sound.js';
import { useLatency } from '../hooks.js';
import Icon from './Icon.jsx';

const PRESETS = [
  { id: 'high', name: 'High', desc: 'All animations, glow and confetti' },
  { id: 'medium', name: 'Balanced', desc: 'Short animations only, no glow or confetti' },
  { id: 'low', name: 'Data saver', desc: 'No animations or effects, hides the activity log. Best for slow phones and networks' },
];

function SettingsPanel({ onClose }) {
  const s = useSettings();
  const ping = useLatency(true, 4000);
  const quality = ping == null ? '…' : ping < 120 ? 'good' : ping < 350 ? 'ok' : 'slow';

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal settings" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Settings">
        <h3>Settings</h3>

        <section>
          <h4>Graphics</h4>
          {s.autoDetected && <p className="muted small left">We picked Data saver for you because your device or connection looks limited. Change it any time.</p>}
          <div className="presets">
            {PRESETS.map((p) => (
              <button key={p.id} className={`preset ${s.gfx === p.id ? 'on' : ''}`} onClick={() => updateSettings({ gfx: p.id })}>
                <b>{p.name}</b><small>{p.desc}</small>
              </button>
            ))}
          </div>
        </section>

        <section>
          <h4>Sound</h4>
          <label className="switch">
            <input type="checkbox" checked={s.sound} onChange={(e) => { updateSettings({ sound: e.target.checked }); if (e.target.checked) setTimeout(() => play('play'), 0); }} />
            <span>Sound effects</span>
          </label>
          <label className="slider">
            <span>Volume</span>
            <input type="range" min="0" max="1" step="0.05" value={s.volume} disabled={!s.sound}
              onChange={(e) => updateSettings({ volume: Number(e.target.value) })}
              onPointerUp={() => play('turn')} />
          </label>
        </section>

        <section>
          <h4>Controls</h4>
          <label className="switch">
            <input type="checkbox" checked={s.confirmTap} onChange={(e) => updateSettings({ confirmTap: e.target.checked })} />
            <span>Tap a card twice to play it <small className="muted">(avoids mis-taps on phones)</small></span>
          </label>
        </section>

        <section>
          <h4>Connection</h4>
          <p className={`conn ${quality}`}>{ping == null ? 'Measuring…' : `${ping} ms · ${quality}`}</p>
        </section>

        <button className="primary" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

export default function SettingsButton({ className = 'ghost' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={`${className} iconbtn`} onClick={() => setOpen(true)} aria-label="Settings" title="Settings"><Icon name="sliders" /> <span className="hide-sm">Settings</span></button>
      {open && <SettingsPanel onClose={() => setOpen(false)} />}
    </>
  );
}
