const TILES = ['U', 'N', 'O', 'H', 'U', 'H'];
const COLORS = ['red', 'yellow', 'green', 'blue', 'red', 'yellow'];

// Six little UNO-coloured tiles. Each drops in with a stagger (CSS handles the motion by graphics level).
export default function Logo() {
  return (
    <h1 className="logo" aria-label="UNO-HUH">
      {TILES.map((t, i) => (
        <span key={i} className={`tile ${COLORS[i]} ${i === 3 ? 'gap' : ''}`} style={{ '--i': i, '--r': `${(i % 2 ? 1 : -1) * (3 + (i % 3) * 2)}deg` }} aria-hidden="true">{t}</span>
      ))}
    </h1>
  );
}
