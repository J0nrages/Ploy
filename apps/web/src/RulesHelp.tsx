export function RulesHelp(props: { onClose?: () => void }) {
  return (
    <section className="rules-panel" aria-labelledby="rules-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">1970 rules</p>
          <h2 id="rules-title">How to play</h2>
        </div>
        {props.onClose ? (
          <button type="button" className="ghost" onClick={props.onClose}>
            Close
          </button>
        ) : null}
      </div>

      <p>
        Move or rotate one piece each turn. Capture by moving onto an opposing piece. Green moves
        first.
      </p>

      <h3>Pieces</h3>
      <ul>
        <li>
          <strong>Commander</strong> — moves 1 space.
        </li>
        <li>
          <strong>Lance</strong> — moves 1–3 spaces.
        </li>
        <li>
          <strong>Probe</strong> — moves 1–2 spaces.
        </li>
        <li>
          <strong>Shield</strong> — moves 1 space and may rotate after moving.
        </li>
      </ul>
      <p>
        A piece moves in a straight line shown by one of its rays. Pieces cannot jump. Rotating in
        place also uses the whole turn.
      </p>

      <h3>Winning</h3>
      <p>
        Defeat an opponent by capturing their Commander or all of their other pieces. In
        free-for-all, captured forces can be taken over. In partnership, defeat both opposing
        players.
      </p>

      <h3>Board controls</h3>
      <ol>
        <li>Select one of the highlighted player’s pieces.</li>
        <li>Select a glowing destination, or choose a rotation button.</li>
        <li>For a Shield move, choose its new facing or keep its current facing.</li>
      </ol>
      <p className="hint">
        Keyboard: arrows move the focus, Enter selects, 1–7 rotates, N keeps a moved Shield’s
        facing, and Escape cancels.
      </p>
    </section>
  );
}
