# Xiangqi rules implemented by this Skill

The engine implements standard Chinese Chess movement and king-safety rules. Its simplified repetition policy is modeled after the public [Xiangqi.com move-limit guidance](https://www.xiangqi.com/help/limits).

## Board and moves

- Red moves first on a 9 × 10 board. UCCI coordinates use Red's lower-left as `a0`.
- Generals and advisors remain in their palaces.
- Elephants cannot cross the river and are blocked by an occupied elephant eye.
- Horses are blocked by an occupied horse leg.
- Chariots slide orthogonally.
- Cannons slide without capturing and require exactly one intervening screen to capture.
- Soldiers move forward before crossing the river and may also move sideways after crossing; they never move backward.
- The two generals may not face each other on an otherwise empty file. Every move is checked against self-check.

## Ending and cycles

- Capturing the opposing general or leaving it with no legal response to check wins.
- A side with no legal move loses even when not in check, so stalemate is a win for the opponent.
- A neutral position occurring for the third time is automatically drawn.
- A side may repeat a perpetual-check cycle three times but the move that would create the fourth occurrence is illegal.
- Sixty consecutive plies without a capture are automatically drawn.
- Resignation awards the game to the opponent.

The engine does not attempt the complete long-chase adjudication used by formal tournament rule sets.
