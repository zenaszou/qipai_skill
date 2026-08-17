import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeXiangqi,
  applyXiangqiMove,
  createXiangqiGame,
  createXiangqiStateFromFen,
  generateXiangqiLegalMoves,
  isXiangqiInCheck,
  xiangqiInternals,
} from "../scripts/xiangqi-engine.mjs";

function values(state) {
  return generateXiangqiLegalMoves(state).map((move) => `${move.from}${move.to}`);
}

test("initial Xiangqi position has 44 legal moves", () => {
  assert.equal(generateXiangqiLegalMoves(createXiangqiGame()).length, 44);
});

test("horse legs, elephant eyes, river, palaces, and cannon screens are enforced", () => {
  const initial = createXiangqiGame();
  assert.equal(values(initial).includes("b0a2"), true);
  const horseBlocked = {
    ...initial,
    board: { ...initial.board, b1: "rP" },
  };
  assert.equal(values(horseBlocked).includes("b0a2"), false);
  assert.equal(values(horseBlocked).includes("b0c2"), false);

  const elephantBlocked = {
    ...initial,
    board: { ...initial.board, b1: "rP" },
  };
  assert.equal(values(elephantBlocked).includes("c0a2"), false);
  assert.equal(values(initial).includes("c0e2"), true);
  assert.equal(values(initial).some((move) => move.startsWith("c0") && Number(move[3]) > 4), false);

  assert.equal(values(initial).includes("b2b9"), true);
  const palace = createXiangqiStateFromFen("4k4/9/9/9/4P4/9/9/9/9/4K4 w");
  assert.equal(values(palace).includes("e0f0"), true);
  assert.equal(values(palace).includes("e0g0"), false);
});

test("flying generals and self-check are enforced", () => {
  const facing = createXiangqiStateFromFen("4k4/9/9/9/9/9/9/9/9/4K4 w");
  assert.equal(values(facing).includes("e0e9"), true);

  const screened = createXiangqiStateFromFen("4k4/9/9/9/4P4/9/9/9/9/4K4 w");
  assert.equal(values(screened).includes("e5d5"), false);
  const capture = applyXiangqiMove(facing, "e0e9");
  assert.equal(capture.ok, true);
  assert.equal(capture.state.status, "won");
  assert.equal(capture.state.resultReason, "general_captured");
});

test("checkmate and stalemate positions have no legal response", () => {
  const basis = createXiangqiStateFromFen("4k4/9/9/9/4P4/9/9/9/9/4K4 b");
  const mate = { ...basis, board: { ...basis.board, a8: "rR", a9: "rR" } };
  assert.equal(isXiangqiInCheck(mate, "black"), true);
  assert.equal(generateXiangqiLegalMoves(mate).length, 0);

  const stalemate = { ...basis, board: { ...basis.board, d0: "rR", f8: "rR" } };
  assert.equal(isXiangqiInCheck(stalemate, "black"), false);
  assert.equal(generateXiangqiLegalMoves(stalemate).length, 0);
});

test("60 quiet plies draw and repetition policy distinguishes perpetual check", () => {
  const quiet = createXiangqiStateFromFen(
    "4k4/9/9/9/4P4/9/9/9/9/R3K4 w",
    { noCapturePly: 59 },
  );
  const draw = applyXiangqiMove(quiet, "a0a1");
  assert.equal(draw.ok, true);
  assert.equal(draw.state.status, "draw");
  assert.equal(draw.state.resultReason, "no_capture_60");

  const { repetitionDecision } = xiangqiInternals;
  const neutral = {
    repetitionMeta: [
      { key: "same", mover: "red", gaveCheck: false },
      { key: "same", mover: "black", gaveCheck: false },
    ],
  };
  assert.equal(repetitionDecision(neutral, "same", "red", false), "draw");
  const checking = {
    repetitionMeta: [
      { key: "same", mover: "red", gaveCheck: true },
      { key: "same", mover: "red", gaveCheck: true },
      { key: "same", mover: "red", gaveCheck: true },
    ],
  };
  assert.equal(
    repetitionDecision(checking, "same", "red", true),
    "forbidden_perpetual_check",
  );
});

test("candidate safety marks a moved piece that can be captured immediately", () => {
  const state = createXiangqiStateFromFen(
    "r3k4/9/9/9/4P4/9/9/9/9/R3K4 w",
  );
  const analysis = analyzeXiangqi(state);
  const threats = analysis.moveDetails.a0a1.opponent_threats;

  assert.deepEqual(threats.moved_piece_captures, ["a9a1"]);
  assert.equal(threats.risk, "moved_piece_en_prise");
  assert.equal(
    analysis.tactical.candidate_safety.moved_piece_en_prise.includes("a0a1"),
    true,
  );
});
