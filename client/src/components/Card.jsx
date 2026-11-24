import Icon from './Icon.jsx';

const ICONS = { skip: 'skip', reverse: 'reverse', wild: 'star' };
const TEXT = { draw2: '+2', wild4: '+4' };

function Face({ value }) {
  if (ICONS[value]) return <Icon name={ICONS[value]} size="1em" />;
  return TEXT[value] ?? value;
}

export default function Card({ card, small, playable, dim, selected, enter, onClick, back, style }) {
  if (back) return <div className={`card back ${small ? 'small' : ''}`}><span>UNO</span></div>;
  const cls = ['card', card.color, small && 'small', playable && 'playable', dim && 'dim', selected && 'sel', enter && 'enter']
    .filter(Boolean).join(' ');
  return (
    <button className={cls} style={style} onClick={onClick} disabled={!onClick} aria-label={`${card.color} ${card.value}`}>
      <span className="oval" />
      <span className="corner"><Face value={card.value} /></span>
      <span className="center"><Face value={card.value} /></span>
      <span className="corner br"><Face value={card.value} /></span>
    </button>
  );
}
