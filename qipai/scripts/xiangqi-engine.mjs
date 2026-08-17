const FILES = "abcdefghi";
const SIDES = ["red", "black"];
const PIECE_VALUES = Object.freeze({ K: 100, R: 9, C: 5, H: 4, E: 2, A: 2, P: 1 });

function opposite(side) {
  return side === "red" ? "black" : "red";
}

function sideCode(side) {
  return side === "red" ? "r" : "b";
}

function sideOf(piece) {
  return piece?.[0] === "r" ? "red" : "black";
}

function typeOf(piece) {
  return piece?.[1] || null;
}

function inside(file, rank) {
  return file >= 0 && file < 9 && rank >= 0 && rank < 10;
}

function cell(file, rank) {
  return inside(file, rank) ? `${FILES[file]}${rank}` : null;
}

function coords(value) {
  if (!/^[a-i][0-9]$/.test(value || "")) return null;
  return { file: FILES.indexOf(value[0]), rank: Number(value[1]) };
}

function cloneBoard(board) {
  return { ...board };
}

function initialBoard() {
  const board = {};
  const back = ["R", "H", "E", "A", "K", "A", "E", "H", "R"];
  for (let file = 0; file < 9; file += 1) {
    board[cell(file, 0)] = `r${back[file]}`;
    board[cell(file, 9)] = `b${back[file]}`;
  }
  for (const file of [0, 2, 4, 6, 8]) {
    board[cell(file, 3)] = "rP";
    board[cell(file, 6)] = "bP";
  }
  board.b2 = "rC";
  board.h2 = "rC";
  board.b7 = "bC";
  board.h7 = "bC";
  return board;
}

function palace(side, file, rank) {
  if (file < 3 || file > 5) return false;
  return side === "red" ? rank >= 0 && rank <= 2 : rank >= 7 && rank <= 9;
}

function crossedRiver(side, rank) {
  return side === "red" ? rank >= 5 : rank <= 4;
}

export function createXiangqiGame(options = {}) {
  const humanSide = options.humanSide === "black" ? "black" : "red";
  const state = {
    game: "xiangqi",
    board: initialBoard(),
    turn: "red",
    humanSide,
    agentSide: opposite(humanSide),
    moves: [],
    noCapturePly: 0,
    positionHistory: [],
    repetitionMeta: [],
    status: "playing",
    winner: null,
    resultReason: null,
    revision: Number.isInteger(options.revision) ? options.revision : 0,
  };
  const key = positionKey(state);
  state.positionHistory = [key];
  state.repetitionMeta = [{ key, mover: null, gaveCheck: false }];
  return state;
}

export function createXiangqiStateFromFen(fen, options = {}) {
  const fields = String(fen).trim().split(/\s+/);
  const rows = fields[0]?.split("/") || [];
  if (rows.length !== 10) throw new Error("Xiangqi FEN requires ten ranks");
  const board = {};
  rows.forEach((encoded, index) => {
    let file = 0;
    for (const char of encoded) {
      if (/\d/.test(char)) file += Number(char);
      else {
        const typeMap = { k: "K", a: "A", b: "E", e: "E", n: "H", h: "H", r: "R", c: "C", p: "P" };
        const type = typeMap[char.toLowerCase()];
        if (!type || file >= 9) throw new Error("Invalid Xiangqi FEN");
        const side = char === char.toUpperCase() ? "r" : "b";
        board[cell(file, 9 - index)] = `${side}${type}`;
        file += 1;
      }
    }
    if (file !== 9) throw new Error("Invalid Xiangqi FEN rank");
  });
  const humanSide = options.humanSide === "black" ? "black" : "red";
  const state = {
    game: "xiangqi",
    board,
    turn: fields[1] === "b" ? "black" : "red",
    humanSide,
    agentSide: opposite(humanSide),
    moves: [],
    noCapturePly: Number(options.noCapturePly || 0),
    positionHistory: [],
    repetitionMeta: [],
    status: "playing",
    winner: null,
    resultReason: null,
    revision: Number.isInteger(options.revision) ? options.revision : 0,
  };
  const key = positionKey(state);
  state.positionHistory = [key];
  state.repetitionMeta = [{ key, mover: null, gaveCheck: false }];
  return state;
}

function addDestination(moves, board, from, to, piece) {
  if (!to) return;
  const target = board[to];
  if (!target || sideOf(target) !== sideOf(piece)) {
    moves.push({ from, to, piece, ...(target ? { capture: target } : {}) });
  }
}

function piecePseudoMoves(board, from, piece) {
  const moves = [];
  const origin = coords(from);
  const side = sideOf(piece);
  const type = typeOf(piece);

  if (type === "K") {
    for (const [df, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const file = origin.file + df;
      const rank = origin.rank + dr;
      if (palace(side, file, rank)) addDestination(moves, board, from, cell(file, rank), piece);
    }
    for (const direction of [-1, 1]) {
      let rank = origin.rank + direction;
      while (inside(origin.file, rank)) {
        const targetCell = cell(origin.file, rank);
        const target = board[targetCell];
        if (target) {
          if (target === `${sideCode(opposite(side))}K`) {
            moves.push({ from, to: targetCell, piece, capture: target, flyingGeneral: true });
          }
          break;
        }
        rank += direction;
      }
    }
  } else if (type === "A") {
    for (const [df, dr] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const file = origin.file + df;
      const rank = origin.rank + dr;
      if (palace(side, file, rank)) addDestination(moves, board, from, cell(file, rank), piece);
    }
  } else if (type === "E") {
    for (const [df, dr] of [[2, 2], [2, -2], [-2, 2], [-2, -2]]) {
      const file = origin.file + df;
      const rank = origin.rank + dr;
      if (!inside(file, rank)) continue;
      if (side === "red" && rank > 4) continue;
      if (side === "black" && rank < 5) continue;
      const eye = cell(origin.file + df / 2, origin.rank + dr / 2);
      if (!board[eye]) addDestination(moves, board, from, cell(file, rank), piece);
    }
  } else if (type === "H") {
    const patterns = [
      [1, 2, 0, 1],
      [2, 1, 1, 0],
      [2, -1, 1, 0],
      [1, -2, 0, -1],
      [-1, -2, 0, -1],
      [-2, -1, -1, 0],
      [-2, 1, -1, 0],
      [-1, 2, 0, 1],
    ];
    for (const [df, dr, lf, lr] of patterns) {
      if (board[cell(origin.file + lf, origin.rank + lr)]) continue;
      addDestination(moves, board, from, cell(origin.file + df, origin.rank + dr), piece);
    }
  } else if (type === "R" || type === "C") {
    for (const [df, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let file = origin.file + df;
      let rank = origin.rank + dr;
      let screened = false;
      while (inside(file, rank)) {
        const to = cell(file, rank);
        const target = board[to];
        if (type === "R") {
          if (!target) moves.push({ from, to, piece });
          else {
            if (sideOf(target) !== side) moves.push({ from, to, piece, capture: target });
            break;
          }
        } else if (!screened) {
          if (!target) moves.push({ from, to, piece });
          else screened = true;
        } else if (target) {
          if (sideOf(target) !== side) moves.push({ from, to, piece, capture: target });
          break;
        }
        file += df;
        rank += dr;
      }
    }
  } else if (type === "P") {
    const direction = side === "red" ? 1 : -1;
    addDestination(moves, board, from, cell(origin.file, origin.rank + direction), piece);
    if (crossedRiver(side, origin.rank)) {
      addDestination(moves, board, from, cell(origin.file - 1, origin.rank), piece);
      addDestination(moves, board, from, cell(origin.file + 1, origin.rank), piece);
    }
  }
  return moves;
}

function pseudoMoves(state, side = state.turn) {
  const moves = [];
  for (const [from, piece] of Object.entries(state.board)) {
    if (sideOf(piece) === side) moves.push(...piecePseudoMoves(state.board, from, piece));
  }
  return moves;
}

function moveCore(state, move) {
  const board = cloneBoard(state.board);
  delete board[move.from];
  board[move.to] = move.piece;
  return {
    ...state,
    board,
    turn: opposite(state.turn),
    noCapturePly: move.capture ? 0 : state.noCapturePly + 1,
  };
}

export function isXiangqiInCheck(state, side = state.turn) {
  const general = Object.entries(state.board).find(
    ([, piece]) => piece === `${sideCode(side)}K`,
  )?.[0];
  if (!general) return true;
  return pseudoMoves({ ...state, turn: opposite(side) }, opposite(side)).some(
    (move) => move.to === general,
  );
}

export function generateXiangqiLegalMoves(state, side = state.turn) {
  if (state.status !== "playing") return [];
  const basis = side === state.turn ? state : { ...state, turn: side };
  return pseudoMoves(basis, side).filter((move) => {
    const next = moveCore(basis, move);
    if (!Object.values(next.board).includes(`${sideCode(opposite(side))}K`)) {
      return !isXiangqiInCheck(next, side);
    }
    return !isXiangqiInCheck(next, side);
  });
}

function notation(move) {
  return `${move.from}${move.to}`;
}

function opponentThreats(state, legalMoves, movedTo) {
  const captures = [];
  const checks = [];
  const mates = [];
  for (const move of legalMoves) {
    const action = notation(move);
    const next = moveCore(state, move);
    const enemyGeneral = `${sideCode(next.turn)}K`;
    const capturedGeneral = !Object.values(next.board).includes(enemyGeneral);
    const check = capturedGeneral || isXiangqiInCheck(next, next.turn);
    const mate =
      capturedGeneral || (check && generateXiangqiLegalMoves(next).length === 0);
    if (move.capture) {
      captures.push({
        action,
        piece: move.capture,
        value: PIECE_VALUES[typeOf(move.capture)] || 0,
        moved_piece: move.to === movedTo,
      });
    }
    if (check) checks.push(action);
    if (mate) mates.push(action);
  }
  const movedPieceCaptures = captures
    .filter((capture) => capture.moved_piece)
    .map((capture) => capture.action);
  const majorCaptures = captures
    .filter((capture) => capture.value >= PIECE_VALUES.C)
    .map((capture) => capture.action);
  return {
    captures,
    checks,
    mates_in_one: mates,
    moved_piece_captures: movedPieceCaptures,
    major_captures: majorCaptures,
    risk:
      mates.length > 0
        ? "immediate_loss"
        : checks.length > 0
          ? "forcing_check"
          : movedPieceCaptures.length > 0
            ? "moved_piece_en_prise"
            : majorCaptures.length > 0
              ? "major_capture"
              : captures.length > 0
                ? "capture"
                : "none",
  };
}

function boardFen(board) {
  const rows = [];
  const fenTypes = { K: "k", A: "a", E: "e", H: "h", R: "r", C: "c", P: "p" };
  for (let rank = 9; rank >= 0; rank -= 1) {
    let encoded = "";
    let empty = 0;
    for (let file = 0; file < 9; file += 1) {
      const piece = board[cell(file, rank)];
      if (!piece) empty += 1;
      else {
        if (empty) encoded += empty;
        empty = 0;
        const letter = fenTypes[typeOf(piece)];
        encoded += sideOf(piece) === "red" ? letter.toUpperCase() : letter;
      }
    }
    if (empty) encoded += empty;
    rows.push(encoded);
  }
  return rows.join("/");
}

export function xiangqiFen(state) {
  return `${boardFen(state.board)} ${state.turn === "red" ? "w" : "b"} - - ${state.noCapturePly} ${Math.floor(state.moves.length / 2) + 1}`;
}

function positionKey(state) {
  return `${boardFen(state.board)} ${state.turn === "red" ? "w" : "b"}`;
}

function repetitionDecision(state, key, mover, gaveCheck) {
  const occurrences = [
    ...state.repetitionMeta.filter((entry) => entry.key === key),
    { key, mover, gaveCheck },
  ];
  const perpetualCheck =
    occurrences.length >= 3 &&
    occurrences.every((entry) => entry.mover === mover && entry.gaveCheck);
  if (occurrences.length >= 4 && perpetualCheck) return "forbidden_perpetual_check";
  if (occurrences.length >= 3 && !perpetualCheck) return "draw";
  return "continue";
}

export function applyXiangqiMove(state, moveValue) {
  if (state.status !== "playing") {
    return { ok: false, code: "game_over", error: "The game is already over." };
  }
  const normalized = String(moveValue || "").trim().toLowerCase();
  if (!/^[a-i][0-9][a-i][0-9]$/.test(normalized)) {
    return { ok: false, code: "invalid_move", error: "Use UCCI notation such as h2e2." };
  }
  const move = generateXiangqiLegalMoves(state).find(
    (candidate) => notation(candidate) === normalized,
  );
  if (!move) {
    return { ok: false, code: "illegal_move", error: `${normalized} is not legal.` };
  }

  let next = moveCore(state, move);
  const enemyGeneral = `${sideCode(next.turn)}K`;
  const generalCaptured = !Object.values(next.board).includes(enemyGeneral);
  const givesCheck = generalCaptured || isXiangqiInCheck(next, next.turn);
  const key = positionKey(next);
  const repetition = repetitionDecision(state, key, state.turn, givesCheck);
  if (repetition === "forbidden_perpetual_check") {
    return {
      ok: false,
      code: "perpetual_check",
      error: "That move would create a fourth perpetual-check repetition.",
    };
  }

  let status = "playing";
  let winner = null;
  let resultReason = null;
  if (generalCaptured) {
    status = "won";
    winner = state.turn;
    resultReason = "general_captured";
  } else {
    const replies = generateXiangqiLegalMoves(next);
    if (replies.length === 0) {
      status = "won";
      winner = state.turn;
      resultReason = givesCheck ? "checkmate" : "stalemate";
    } else if (repetition === "draw") {
      status = "draw";
      resultReason = "threefold_repetition";
    } else if (next.noCapturePly >= 60) {
      status = "draw";
      resultReason = "no_capture_60";
    }
  }

  const historyMove = {
    number: state.moves.length + 1,
    side: state.turn,
    move: normalized,
    from: move.from,
    to: move.to,
    piece: move.piece,
    capture: move.capture || null,
    check: givesCheck,
  };
  next = {
    ...next,
    moves: [...state.moves, historyMove],
    positionHistory: [...state.positionHistory, key],
    repetitionMeta: [
      ...state.repetitionMeta,
      { key, mover: state.turn, gaveCheck: givesCheck },
    ],
    status,
    winner,
    resultReason,
    revision: state.revision + 1,
  };
  return { ok: true, state: next, move: historyMove };
}

export function analyzeXiangqi(state) {
  if (state.status !== "playing") {
    return {
      legalMoves: [],
      moveDetails: {},
      tactical: {
        captures: [],
        checks: [],
        mates_in_one: [],
        mandatory_responses: [],
        candidate_safety: {
          immediate_loss: [],
          forcing_reply: [],
          moved_piece_en_prise: [],
          major_capture: [],
        },
      },
    };
  }
  const legal = generateXiangqiLegalMoves(state);
  const details = {};
  const captures = [];
  const checks = [];
  const mates = [];
  const candidateSafety = {
    immediate_loss: [],
    forcing_reply: [],
    moved_piece_en_prise: [],
    major_capture: [],
  };
  for (const move of legal) {
    const value = notation(move);
    const next = moveCore(state, move);
    const enemyGeneral = `${sideCode(next.turn)}K`;
    const capturedGeneral = !Object.values(next.board).includes(enemyGeneral);
    const check = capturedGeneral || isXiangqiInCheck(next, next.turn);
    const replies = capturedGeneral ? [] : generateXiangqiLegalMoves(next);
    const mate = capturedGeneral || (check && replies.length === 0);
    const threats = opponentThreats(next, replies, move.to);
    details[value] = {
      from: move.from,
      to: move.to,
      piece: move.piece,
      capture: move.capture || null,
      check,
      mate,
      opponent_threats: threats,
    };
    if (move.capture) captures.push(value);
    if (check) checks.push(value);
    if (mate) mates.push(value);
    if (threats.mates_in_one.length) candidateSafety.immediate_loss.push(value);
    if (threats.checks.length) candidateSafety.forcing_reply.push(value);
    if (threats.moved_piece_captures.length) {
      candidateSafety.moved_piece_en_prise.push(value);
    }
    if (threats.major_captures.length) candidateSafety.major_capture.push(value);
  }
  const values = legal.map(notation);
  return {
    legalMoves: values,
    moveDetails: details,
    tactical: {
      captures,
      checks,
      mates_in_one: mates,
      mandatory_responses: isXiangqiInCheck(state) ? values : [],
      candidate_safety: candidateSafety,
    },
  };
}

export function resignXiangqi(state, side) {
  if (state.status !== "playing" || !SIDES.includes(side)) return state;
  return {
    ...state,
    status: "won",
    winner: opposite(side),
    resultReason: "resignation",
    revision: state.revision + 1,
  };
}

export const xiangqiInternals = Object.freeze({
  boardFen,
  moveCore,
  notation,
  piecePseudoMoves,
  positionKey,
  repetitionDecision,
});
