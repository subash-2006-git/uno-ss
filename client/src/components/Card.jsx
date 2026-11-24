const FACE = { skip: '⊘', reverse: '⇄', draw2: '+2', wild: '★', wild4: '+4' };

export default function Card({ card, small, playable, dim, selected, enter, onClick, back }) {
  if (back) return <div className={`card back ${small ? 'small' : ''}`}><span>UNO</span></div>;
  const face = FACE[card.value] ?? card.value;
  const cls = ['card', card.color, small && 'small', playable && 'playable', dim && 'dim', selected && 'sel', enter && 'enter']
    .filter(Boolean).join(' ');
  return (
    <button className={cls} onClick={onClick} disabled={!onClick} aria-label={`${card.color} ${card.value}`}>
      <span className="corner">{face}</span>
      <span className="center">{face}</span>
      <span className="corner br">{face}</span>
    </button>
  );
}
