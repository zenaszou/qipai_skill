# Chess rules implemented by this Skill

The engine follows the over-the-board move semantics in the [FIDE Laws of Chess, effective January 2023](https://handbook.fide.com/chapter/e012023), with explicit online-casual automatic draw behavior.

## Moves and king safety

- White moves first on an 8 × 8 board using UCI coordinates.
- All standard piece moves, captures, pins, and king-safety restrictions are enforced.
- Castling is legal only with the corresponding right, unmoved pieces on their expected squares, an empty path, and no check on the king's start, transit, or destination square.
- En passant is available only on the immediately following move and is rejected when it would expose the moving side's king.
- A pawn reaching the last rank must promote to queen, rook, bishop, or knight. UCI suffixes are `q`, `r`, `b`, and `n`.

## Ending the game

- Checkmate wins; stalemate draws.
- King versus king, king and one bishop versus king, king and one knight versus king, and bishop-only positions whose bishops all occupy one color complex are automatically drawn as insufficient material.
- The same canonical position for the third time is automatically drawn.
- A halfmove clock of 100 plies without a pawn move or capture is automatically drawn.
- Resignation awards the game to the opponent.

The repetition and 100-ply rules are automatic for this casual interface; FIDE claim procedures and the 75-move rule are not modeled separately.
