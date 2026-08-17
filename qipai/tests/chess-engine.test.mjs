import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeChess,
  applyChessMove,
  chessPerft,
  createChessGame,
  createChessStateFromFen,
  generateChessLegalMoves,
  isChessInCheck,
} from "../scripts/chess-engine.mjs";

function play(moves, state = createChessGame()) {
  for (const move of moves) {
    const result = applyChessMove(state, move);
    assert.equal(result.ok, true, `${move}: ${result.error || "move failed"}`);
    state = result.state;
  }
  return state;
}

function values(state) {
  return generateChessLegalMoves(state).map(
    (move) => `${move.from}${move.to}${move.promotion || ""}`,
  );
}

test("initial chess perft matches the standard reference", () => {
  const state = createChessGame();
  assert.equal(chessPerft(state, 1), 20);
  assert.equal(chessPerft(state, 2), 400);
  assert.equal(chessPerft(state, 3), 8902);
});

test("self-check, castling, and en passant are enforced", () => {
  const pinned = createChessStateFromFen("4r1k1/8/8/8/8/8/4R3/4K3 w - - 0 1");
  assert.equal(values(pinned).includes("e2d2"), false);

  const castling = createChessStateFromFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
  assert.equal(values(castling).includes("e1g1"), true);
  assert.equal(values(castling).includes("e1c1"), true);
  const castled = applyChessMove(castling, "e1g1");
  assert.equal(castled.ok, true);
  assert.equal(castled.state.board.g1, "wK");
  assert.equal(castled.state.board.f1, "wR");

  const enPassant = createChessStateFromFen("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1");
  const captured = applyChessMove(enPassant, "e5d6");
  assert.equal(captured.ok, true);
  assert.equal(captured.state.board.d5, undefined);
  assert.equal(captured.state.board.d6, "wP");
});

test("all four promotion choices are legal", () => {
  const state = createChessStateFromFen("4k3/P7/8/8/8/8/8/4K3 w - - 0 1");
  assert.deepEqual(
    values(state).filter((move) => move.startsWith("a7a8")).sort(),
    ["a7a8b", "a7a8n", "a7a8q", "a7a8r"],
  );
});

test("checkmate, stalemate, and common insufficient material are detected", () => {
  const mate = play(["f2f3", "e7e5", "g2g4", "d8h4"]);
  assert.equal(mate.status, "won");
  assert.equal(mate.winner, "black");
  assert.equal(mate.resultReason, "checkmate");

  const stalemate = createChessStateFromFen("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
  assert.equal(isChessInCheck(stalemate, "black"), false);
  assert.equal(generateChessLegalMoves(stalemate).length, 0);

  const material = createChessStateFromFen("4k3/8/8/8/8/8/2B5/4K3 w - - 0 1");
  const draw = applyChessMove(material, "c2d3");
  assert.equal(draw.ok, true);
  assert.equal(draw.state.status, "draw");
  assert.equal(draw.state.resultReason, "insufficient_material");
});

test("threefold repetition and 100 halfmoves draw automatically", () => {
  const repeated = play([
    "g1f3", "g8f6", "f3g1", "f6g8",
    "g1f3", "g8f6", "f3g1", "f6g8",
  ]);
  assert.equal(repeated.status, "draw");
  assert.equal(repeated.resultReason, "threefold_repetition");

  const quiet = createChessStateFromFen("4k2r/8/8/8/8/8/8/R3K3 w - - 99 1");
  const fifty = applyChessMove(quiet, "a1a2");
  assert.equal(fifty.ok, true);
  assert.equal(fifty.state.status, "draw");
  assert.equal(fifty.state.resultReason, "fifty_move");
});

test("candidate safety exposes every one-ply opponent tactic", () => {
  const state = play(["f2f3", "e7e5"]);
  const analysis = analyzeChess(state);
  const threats = analysis.moveDetails.g2g4.opponent_threats;

  assert.deepEqual(threats.mates_in_one, ["d8h4"]);
  assert.equal(threats.risk, "immediate_loss");
  assert.equal(analysis.tactical.candidate_safety.immediate_loss.includes("g2g4"), true);
  assert.equal(
    analysis.moveDetails.g2g3.opponent_threats.mates_in_one.includes("d8h4"),
    false,
  );
});
