# Renju rules implemented by this skill

The server implements the core playing rules from the [RIF International Rules](https://www.renju.net/rifrules/), especially sections 2, 4, and 9. It intentionally excludes the tournament opening procedures in section 12.

## Board and turns

- Use a 15 × 15 board with coordinates A1 through O15.
- Black moves first and must open at the center, H8.
- Alternate black and white after every legal move.
- Reject an occupied, out-of-range, out-of-turn, or stale-revision move without changing the revision.

## Winning and forbidden moves

- White wins by making a contiguous line of five or more stones.
- Black wins only with a contiguous line of exactly five stones.
- A black exact five takes precedence when the same move also forms a normally forbidden pattern.
- If black does not simultaneously make an exact five, reject:
  - an overline: a contiguous line of six or more black stones;
  - a double-four: two or more distinct fours created by the move;
  - a forbidden double-three: two or more real threes created by the move.
- Declare a draw only when the board is full and neither side won on the last move.

## Pattern semantics

A **four** is a distinct set of four black stones, including the new stone, that can be completed with one black move into an exact contiguous five. An open four with two winning endpoints remains one four because its four-stone set is the same.

An **apparent three** is a distinct set of three black stones, including the new stone, with an empty extension that would form a straight four: four contiguous black stones with an empty intersection at each end.

An apparent three is a **real three** only when at least one such extension is a legal black move. Evaluate the extension with the same rules:

1. Allow it if it makes an exact five.
2. Reject it if it makes an overline.
3. Reject it if it makes a double-four.
4. Re-evaluate any double-three recursively under this same procedure.

This recursive test implements the RIF 9.3 exceptions: an apparent double-three is allowed when fewer than two of its threes can legally become straight fours.

The engine memoizes each recursive query by board position, candidate coordinate, and opening constraint. Each recursive branch adds a stone, so it terminates without a depth approximation.

## Out of scope

- RIF tournament opening and swap procedures
- fifth-move candidate declarations
- clocks and time controls
- pass and draw offers; the shared shell supports ordinary resignation
- spectators, multiple humans, remote hosting, and concurrent games
