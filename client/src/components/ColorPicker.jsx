export default function ColorPicker({ onPick, onCancel }) {
  return (
    <div className="modal-bg" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Choose a colour</h3>
        <div className="swatches">
          {['red', 'yellow', 'green', 'blue'].map((c) => (
            <button key={c} className={`swatch ${c}`} onClick={() => onPick(c)} aria-label={c} />
          ))}
        </div>
        <button className="ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
