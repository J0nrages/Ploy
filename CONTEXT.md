# Ploy Domain Language

Ploy is a path-board capture game whose scheduled seats, acting colors, piece colors, and piece controllers can differ after elimination or takeover.

## Language

**Seat**:
A color's fixed place in the turn cycle.
_Avoid_: Player when referring only to turn order

**Turn seat**:
The seat currently scheduled to act, even when its partner controls that turn.
_Avoid_: Current player, to-move color

**Acting color**:
The color authorized to make the move for the current turn seat.
_Avoid_: Turn seat when partnership substitution is possible

**Piece color**:
The immutable color printed on a piece and used for its visual identity.
_Avoid_: Owner

**Piece controller**:
The color currently authorized to move a piece; it changes only through free-for-all takeover.
_Avoid_: Piece color, owner

**Strictly defeated**:
A color whose Commander is absent or whose Lances, Probes, and Shields are all absent.
_Avoid_: Captured, out

**Inactive seat**:
A seat that no longer takes turns independently. Free-for-all defeat makes a seat inactive; in partnership a seat becomes inactive only after all pieces of its color are gone.
_Avoid_: Eliminated when the mode-specific distinction matters

**Partnership substitution**:
A partner acting during an inactive teammate's turn seat using the partner's own pieces.
_Avoid_: Absorption, takeover

**Takeover**:
Free-for-all transfer of a defeated color's remaining forces to the capturing color's control without changing their printed colors.
_Avoid_: Recoloring, partnership substitution

**Motion move**:
A straight-ray move to another board vertex, optionally including a Shield's post-motion rotation.
_Avoid_: Slide

**Direction move**:
A move that rotates a piece in place to a distinct resulting set of movement directions.
_Avoid_: Motion, turn

**Opponent strength**:
The computer opponent's search accuracy and permitted controlled error.
_Avoid_: Difficulty when referring to playing ability

**Opponent style**:
A stable preference among strategically close moves that never overrides a forced result or Commander safety.
_Avoid_: Strength, personality

**Opponent profile**:
The combination of opponent strength and opponent style used for a computer seat.
_Avoid_: Difficulty preset

**Game seed**:
A value fixed for one game that makes retries and resumed play repeatable while allowing different games to vary.
_Avoid_: Random seed when game-level continuity matters

**Profile revision**:
The identity of the opponent profile currently authorized to choose the next computer move.
_Avoid_: Lease epoch, ply

**Adaptive strength**:
An optional bounded adjustment of opponent strength based on several qualifying human moves.
_Avoid_: Rubber-banding, adaptive style

**Referee analysis**:
A balanced assessment of a human move that is independent of the computer opponent's current strength and style.
_Avoid_: Opponent search

**Qualifying move**:
A human move for which referee analysis has enough choice and confidence to inform adaptive strength.
_Avoid_: Every human move
