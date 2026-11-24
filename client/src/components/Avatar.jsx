const PALETTE = ['#c62828', '#b45f00', '#2e7d32', '#1565c0', '#7b1fa2', '#ad1457', '#00796b', '#4527a0'];

// Colour is derived from the name so a player looks the same to everyone, with no images to download.
export default function Avatar({ name = '?', size = 36 }) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.46, background: PALETTE[h % PALETTE.length] }} aria-hidden="true">
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}
