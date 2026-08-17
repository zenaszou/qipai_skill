import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeBlackMove,
  applyMove,
  createBoard,
  createGame,
  positionFromCell,
} from "../scripts/renju-engine.mjs";

function blackBoard(cells) {
  const board = createBoard();
  for (const cell of cells) {
    const position = positionFromCell(cell);
    board[position.row][position.col] = "black";
  }
  return board;
}

function play(cells, humanStone = "black") {
  let state = createGame({ humanStone });
  for (const cell of cells) {
    const result = applyMove(state, cell);
    assert.equal(result.ok, true, `${cell}: ${result.error || "move failed"}`);
    state = result.state;
  }
  return state;
}

test("coordinates cover A1 through O15", () => {
  assert.deepEqual(positionFromCell("A1"), { row: 0, col: 0, cell: "A1" });
  assert.deepEqual(positionFromCell("o15"), { row: 14, col: 14, cell: "O15" });
  assert.equal(positionFromCell("P8"), null);
  assert.equal(positionFromCell("H16"), null);
});

test("black must open at H8 and turns alternate", () => {
  const initial = createGame({ humanStone: "white" });
  const wrong = applyMove(initial, "G8");
  assert.equal(wrong.ok, false);
  assert.equal(wrong.code, "opening_center");
  assert.equal(initial.revision, 0);

  const state = play(["H8", "G8"], "white");
  assert.equal(state.moves[0].actor, "agent");
  assert.equal(state.moves[1].actor, "human");
  assert.equal(state.turn, "black");
});

test("black wins with exactly five", () => {
  const state = play(["H8", "A1", "G8", "A2", "I8", "A3", "F8", "A4", "J8"]);
  assert.equal(state.status, "won");
  assert.equal(state.winner.stone, "black");
  assert.deepEqual(state.winningLine, ["F8", "G8", "H8", "I8", "J8"]);
});

test("white wins with five or an overline", () => {
  const board = createBoard();
  for (const cell of ["B8", "C8", "D8", "E8", "F8"]) {
    const position = positionFromCell(cell);
    board[position.row][position.col] = "white";
  }
  const state = {
    ...createGame(),
    board,
    turn: "white",
    moves: Array.from({ length: 11 }, (_, index) => ({
      number: index + 1,
      cell: `A${index + 1}`,
      stone: index % 2 ? "white" : "black",
      actor: index % 2 ? "agent" : "human",
    })),
  };
  const result = applyMove(state, "G8");
  assert.equal(result.ok, true);
  assert.equal(result.state.status, "won");
  assert.equal(result.state.winningLine.length, 6);
});

test("black overline is forbidden", () => {
  const analysis = analyzeBlackMove(
    blackBoard(["B8", "C8", "D8", "E8", "F8"]),
    "G8",
  );
  assert.equal(analysis.legal, false);
  assert.equal(analysis.reason, "overline");
});

test("black double-four is forbidden", () => {
  const analysis = analyzeBlackMove(
    blackBoard(["G8", "I8", "J8", "H7", "H9", "H10"]),
    "H8",
  );
  assert.equal(analysis.legal, false);
  assert.equal(analysis.reason, "double_four");
  assert.equal(analysis.details.four_count, 2);
});

test("a simple black double-three is forbidden", () => {
  const analysis = analyzeBlackMove(
    blackBoard(["G8", "I8", "H7", "H9"]),
    "H8",
  );
  assert.equal(analysis.legal, false);
  assert.equal(analysis.reason, "double_three");
  assert.equal(analysis.details.real_three_count, 2);
});

test("RIF recursive exception allows an apparent double-three", () => {
  const board = blackBoard([
    "F6",
    "G6",
    "H11",
    "H7",
    "H9",
    "I7",
    "J8",
    "K8",
  ]);
  const root = analyzeBlackMove(board, "H8");
  assert.equal(root.legal, true);
  assert.equal(root.details.apparent_three_count, 2);
  assert.equal(root.details.real_three_count, 1);

  const afterRoot = blackBoard([
    "F6",
    "G6",
    "H11",
    "H7",
    "H8",
    "H9",
    "I7",
    "J8",
    "K8",
  ]);
  const recursiveExtension = analyzeBlackMove(afterRoot, "H6");
  assert.equal(recursiveExtension.reason, "double_three");
});

test("an exact five takes precedence over a simultaneous overline", () => {
  const analysis = analyzeBlackMove(
    blackBoard([
      "B8",
      "C8",
      "D8",
      "E8",
      "F8",
      "G7",
      "G9",
      "G10",
      "G11",
    ]),
    "G8",
  );
  assert.equal(analysis.legal, true);
  assert.equal(analysis.win, true);
  assert.deepEqual(analysis.winningLine, ["G7", "G8", "G9", "G10", "G11"]);
});

test("a legal last intersection produces a full-board draw", () => {
  const board = createBoard();
  const moves = [];
  for (let row = 0; row < 15; row += 1) {
    for (let col = 0; col < 15; col += 1) {
      if (row === 7 && col === 7) continue;
      const stone = (row + 2 * col) % 5 < 2 ? "black" : "white";
      board[row][col] = stone;
      moves.push({
        number: moves.length + 1,
        cell: `${"ABCDEFGHIJKLMNO"[col]}${row + 1}`,
        stone,
        actor: stone === "black" ? "human" : "agent",
      });
    }
  }
  const state = {
    ...createGame(),
    board,
    moves,
    turn: "black",
  };
  const result = applyMove(state, "H8");
  assert.equal(result.ok, true);
  assert.equal(result.state.status, "draw");
});
