export default function Scoreboard({ players, target, meId }) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  return (
    <ul className="scoreboard">
      {sorted.map((p) => (
        <li key={p.id} className={p.id === meId ? 'me' : ''}>
          <span>{p.name}{p.id === meId ? ' (you)' : ''}</span>
          <span className="bar"><i style={{ width: `${Math.min(100, (p.score / target) * 100)}%` }} /></span>
          <b>{p.score}</b>
        </li>
      ))}
    </ul>
  );
}
