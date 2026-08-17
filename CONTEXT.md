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
