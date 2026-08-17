const FILES = "abcdefgh";
const SIDES = ["white", "black"];
const PROMOTIONS = ["q", "r", "b", "n"];
const PIECE_VALUES = Object.freeze({ K: 100, Q: 9, R: 5, B: 3, N: 3, P: 1 });

function opposite(side) {
  return side === "white" ? "black" : "white";
}

function sideCode(side) {
  return side === "white" ? "w" : "b";
}

function sideOf(piece) {
  return piece?.[0] === "w" ? "white" : "black";
}

function typeOf(piece) {
  return piece?.[1] || null;
}

function inside(file, rank) {
  return file >= 0 && file < 8 && rank >= 0 && rank < 8;
}

function square(file, rank) {
  return inside(file, rank) ? `${FILES[file]}${rank + 1}` : null;
}

function coords(value) {
  if (!/^[a-h][1-8]$/.test(value || "")) return null;
  return { file: FILES.indexOf(value[0]), rank: Number(value[1]) - 1 };
}

function cloneBoard(board) {
  return { ...board };
}

function initialBoard() {
  const board = {};
  const back = ["R", "N", "B", "Q", "K", "B", "N", "R"];
  for (let file = 0; file < 8; file += 1) {
    board[square(file, 0)] = `w${back[file]}`;
    board[square(file, 1)] = "wP";
    board[square(file, 6)] = "bP";
    board[square(file, 7)] = `b${back[file]}`;
  }
  return board;
}

function emptyCastling() {
  return { K: false, Q: false, k: false, q: false };
}

export function createChessGame(options = {}) {
  const humanSide = options.humanSide === "black" ? "black" : "white";
  const state = {
    game: "chess",
    board: initialBoard(),
    turn: "white",
    humanSide,
    agentSide: opposite(humanSide),
    castling: { K: true, Q: true, k: true, q: true },
    enPassant: null,
    halfmoveClock: 0,
    fullmoveNumber: 1,
    moves: [],
    positionHistory: [],
    positionCounts: {},
    status: "playing",
    winner: null,
    resultReason: null,
    revision: Number.isInteger(options.revision) ? options.revision : 0,
  };
  const key = positionKey(state);
  state.positionHistory = [key];
  state.positionCounts = { [key]: 1 };
  return state;
}

export function createChessStateFromFen(fen, options = {}) {
  const fields = String(fen).trim().split(/\s+/);
  if (fields.length < 4) throw new Error("FEN requires at least four fields");
  const ranks = fields[0].split("/");
  if (ranks.length !== 8) throw new Error("FEN board must have eight ranks");
  const board = {};
  ranks.forEach((encoded, fenIndex) => {
    let file = 0;
    for (const char of encoded) {
      if (/\d/.test(char)) file += Number(char);
      else {
        const side = char === char.toUpperCase() ? "w" : "b";
        const type = char.toUpperCase();
        if (!"KQRBNP".includes(type) || file >= 8) throw new Error("Invalid FEN");
        board[square(file, 7 - fenIndex)] = `${side}${type}`;
        file += 1;
      }
    }
    if (file !== 8) throw new Error("Invalid FEN rank width");
  });
  const humanSide = options.humanSide === "black" ? "black" : "white";
  const castling = emptyCastling();
  if (fields[2] !== "-") {
    for (const right of fields[2]) {
      if (right in castling) castling[right] = true;
    }
  }
  const state = {
    game: "chess",
    board,
    turn: fields[1] === "b" ? "black" : "white",
    humanSide,
    agentSide: opposite(humanSide),
    castling,
    enPassant: fields[3] === "-" ? null : fields[3],
    halfmoveClock: Number(fields[4] || 0),
    fullmoveNumber: Number(fields[5] || 1),
    moves: [],
    positionHistory: [],
    positionCounts: {},
    status: "playing",
    winner: null,
    resultReason: null,
    revision: Number.isInteger(options.revision) ? options.revision : 0,
  };
  const key = positionKey(state);
  state.positionHistory = [key];
  state.positionCounts = { [key]: 1 };
  return state;
}

function attacksSquare(board, target, bySide) {
  const targetCoords = coords(target);
  if (!targetCoords) return false;
  const pawnDirection = bySide === "white" ? 1 : -1;
  for (const deltaFile of [-1, 1]) {
    const from = square(
      targetCoords.file - deltaFile,
      targetCoords.rank - pawnDirection,
    );
    if (from && board[from] === `${sideCode(bySide)}P`) return true;
  }

  for (const [df, dr] of [
    [1, 2],
    [2, 1],
    [2, -1],
    [1, -2],
    [-1, -2],
    [-2, -1],
    [-2, 1],
    [-1, 2],
  ]) {
    const from = square(targetCoords.file + df, targetCoords.rank + dr);
    if (from && board[from] === `${sideCode(bySide)}N`) return true;
  }

  for (let df = -1; df <= 1; df += 1) {
    for (let dr = -1; dr <= 1; dr += 1) {
      if (df === 0 && dr === 0) continue;
      const from = square(targetCoords.file + df, targetCoords.rank + dr);
      if (from && board[from] === `${sideCode(bySide)}K`) return true;
    }
  }

  const sliders = [
    [1, 0, "RQ"],
    [-1, 0, "RQ"],
    [0, 1, "RQ"],
    [0, -1, "RQ"],
    [1, 1, "BQ"],
    [1, -1, "BQ"],
    [-1, 1, "BQ"],
    [-1, -1, "BQ"],
  ];
  for (const [df, dr, types] of sliders) {
    let file = targetCoords.file + df;
    let rank = targetCoords.rank + dr;
    while (inside(file, rank)) {
      const piece = board[square(file, rank)];
      if (piece) {
        if (sideOf(piece) === bySide && types.includes(typeOf(piece))) return true;
        break;
      }
      file += df;
      rank += dr;
    }
  }
  return false;
}

export function isChessInCheck(state, side = state.turn) {
  const king = Object.entries(state.board).find(
    ([, piece]) => piece === `${sideCode(side)}K`,
  )?.[0];
  return !king || attacksSquare(state.board, king, opposite(side));
}

function pushPawnMove(moves, board, from, to, piece, options = {}) {
  const targetRank = Number(to[1]);
  const promotes =
    (piece === "wP" && targetRank === 8) || (piece === "bP" && targetRank === 1);
  if (promotes) {
    for (const promotion of PROMOTIONS) {
      moves.push({ from, to, piece, promotion, ...options });
    }
  } else {
    moves.push({ from, to, piece, ...options });
  }
}

function pseudoMoves(state, side = state.turn) {
  const moves = [];
  const board = state.board;
  for (const [from, piece] of Object.entries(board)) {
    if (sideOf(piece) !== side) continue;
    const origin = coords(from);
    const type = typeOf(piece);

    if (type === "P") {
      const direction = side === "white" ? 1 : -1;
      const startRank = side === "white" ? 1 : 6;
      const one = square(origin.file, origin.rank + direction);
      if (one && !board[one]) {
        pushPawnMove(moves, board, from, one, piece);
        const two = square(origin.file, origin.rank + 2 * direction);
        if (origin.rank === startRank && two && !board[two]) {
          moves.push({ from, to: two, piece, doublePawn: true });
        }
      }
      for (const df of [-1, 1]) {
        const to = square(origin.file + df, origin.rank + direction);
        if (!to) continue;
        const target = board[to];
        if (target && sideOf(target) !== side && typeOf(target) !== "K") {
          pushPawnMove(moves, board, from, to, piece, { capture: target });
        } else if (to === state.enPassant) {
          const captureSquare = square(origin.file + df, origin.rank);
          const captured = board[captureSquare];
          if (captured === `${sideCode(opposite(side))}P`) {
            pushPawnMove(moves, board, from, to, piece, {
              capture: captured,
              enPassant: captureSquare,
            });
          }
        }
      }
    } else if (type === "N") {
      for (const [df, dr] of [
        [1, 2],
        [2, 1],
        [2, -1],
        [1, -2],
        [-1, -2],
        [-2, -1],
        [-2, 1],
        [-1, 2],
      ]) {
        const to = square(origin.file + df, origin.rank + dr);
        if (!to) continue;
        const target = board[to];
        if (!target || (sideOf(target) !== side && typeOf(target) !== "K")) {
          moves.push({ from, to, piece, ...(target ? { capture: target } : {}) });
        }
      }
    } else if (type === "B" || type === "R" || type === "Q") {
      const directions =
        type === "B"
          ? [[1, 1], [1, -1], [-1, 1], [-1, -1]]
          : type === "R"
            ? [[1, 0], [-1, 0], [0, 1], [0, -1]]
            : [
                [1, 1],
                [1, -1],
                [-1, 1],
                [-1, -1],
                [1, 0],
                [-1, 0],
                [0, 1],
                [0, -1],
              ];
      for (const [df, dr] of directions) {
        let file = origin.file + df;
        let rank = origin.rank + dr;
        while (inside(file, rank)) {
          const to = square(file, rank);
          const target = board[to];
          if (!target) moves.push({ from, to, piece });
          else {
            if (sideOf(target) !== side && typeOf(target) !== "K") {
              moves.push({ from, to, piece, capture: target });
            }
            break;
          }
          file += df;
          rank += dr;
        }
      }
    } else if (type === "K") {
      for (let df = -1; df <= 1; df += 1) {
        for (let dr = -1; dr <= 1; dr += 1) {
          if (df === 0 && dr === 0) continue;
          const to = square(origin.file + df, origin.rank + dr);
          if (!to) continue;
          const target = board[to];
          if (!target || (sideOf(target) !== side && typeOf(target) !== "K")) {
            moves.push({ from, to, piece, ...(target ? { capture: target } : {}) });
          }
        }
      }
      const rank = side === "white" ? 0 : 7;
      const code = side === "white" ? "" : "b";
      const kingStart = square(4, rank);
      if (from === kingStart && !isChessInCheck(state, side)) {
        if (
          state.castling[code ? "k" : "K"] &&
          board[square(7, rank)] === `${sideCode(side)}R` &&
          !board[square(5, rank)] &&
          !board[square(6, rank)] &&
          !attacksSquare(board, square(5, rank), opposite(side)) &&
          !attacksSquare(board, square(6, rank), opposite(side))
        ) {
          moves.push({
            from,
            to: square(6, rank),
            piece,
            castle: "king",
            rookFrom: square(7, rank),
            rookTo: square(5, rank),
          });
        }
        if (
          state.castling[code ? "q" : "Q"] &&
          board[square(0, rank)] === `${sideCode(side)}R` &&
          !board[square(1, rank)] &&
          !board[square(2, rank)] &&
          !board[square(3, rank)] &&
          !attacksSquare(board, square(3, rank), opposite(side)) &&
          !attacksSquare(board, square(2, rank), opposite(side))
        ) {
          moves.push({
            from,
            to: square(2, rank),
            piece,
            castle: "queen",
            rookFrom: square(0, rank),
            rookTo: square(3, rank),
          });
        }
      }
    }
  }
  return moves;
}

function moveCore(state, move) {
  const board = cloneBoard(state.board);
  delete board[move.from];
  if (move.enPassant) delete board[move.enPassant];
  if (move.castle) {
    board[move.rookTo] = board[move.rookFrom];
    delete board[move.rookFrom];
  }
  board[move.to] = move.promotion
    ? `${sideCode(sideOf(move.piece))}${move.promotion.toUpperCase()}`
    : move.piece;

  const castling = { ...state.castling };
  if (move.piece === "wK") {
    castling.K = false;
    castling.Q = false;
  }
  if (move.piece === "bK") {
    castling.k = false;
    castling.q = false;
  }
  const rookRights = {
    a1: "Q",
    h1: "K",
    a8: "q",
    h8: "k",
  };
  if (typeOf(move.piece) === "R" && rookRights[move.from]) {
    castling[rookRights[move.from]] = false;
  }
  if (move.capture && rookRights[move.to]) {
    castling[rookRights[move.to]] = false;
  }

  const origin = coords(move.from);
  const target = coords(move.to);
  const enPassant =
    move.doublePawn
      ? square(origin.file, (origin.rank + target.rank) / 2)
      : null;
  const pawnMove = typeOf(move.piece) === "P";
  return {
    ...state,
    board,
    turn: opposite(state.turn),
    castling,
    enPassant,
    halfmoveClock: pawnMove || move.capture ? 0 : state.halfmoveClock + 1,
    fullmoveNumber:
      state.turn === "black" ? state.fullmoveNumber + 1 : state.fullmoveNumber,
  };
}

export function generateChessLegalMoves(state, side = state.turn) {
  if (state.status !== "playing") return [];
  const basis = side === state.turn ? state : { ...state, turn: side };
  return pseudoMoves(basis, side).filter((move) => {
    const next = moveCore(basis, move);
    return !isChessInCheck(next, side);
  });
}

function uci(move) {
  return `${move.from}${move.to}${move.promotion || ""}`;
}

function opponentThreats(state, legalMoves, movedTo) {
  const captures = [];
  const checks = [];
  const mates = [];
  for (const move of legalMoves) {
    const action = uci(move);
    const next = moveCore(state, move);
    const check = isChessInCheck(next, next.turn);
    const mate = check && generateChessLegalMoves(next).length === 0;
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
    .filter((capture) => capture.value >= PIECE_VALUES.R)
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

function normalizedEnPassant(state) {
  if (!state.enPassant) return "-";
  const legalCapture = pseudoMoves(state, state.turn)
    .filter((move) => move.enPassant && move.to === state.enPassant)
    .some((move) => !isChessInCheck(moveCore(state, move), state.turn));
  if (legalCapture) return state.enPassant;
  return "-";
}

function boardFen(board) {
  const ranks = [];
  for (let rank = 7; rank >= 0; rank -= 1) {
    let encoded = "";
    let empty = 0;
    for (let file = 0; file < 8; file += 1) {
      const piece = board[square(file, rank)];
      if (!piece) empty += 1;
      else {
        if (empty) encoded += empty;
        empty = 0;
        const letter = typeOf(piece);
        encoded += sideOf(piece) === "white" ? letter : letter.toLowerCase();
      }
    }
    if (empty) encoded += empty;
    ranks.push(encoded);
  }
  return ranks.join("/");
}

export function chessFen(state) {
  const rights = ["K", "Q", "k", "q"].filter((key) => state.castling[key]).join("");
  return `${boardFen(state.board)} ${state.turn === "white" ? "w" : "b"} ${rights || "-"} ${state.enPassant || "-"} ${state.halfmoveClock} ${state.fullmoveNumber}`;
}

function positionKey(state) {
  const rights = ["K", "Q", "k", "q"].filter((key) => state.castling[key]).join("");
  return `${boardFen(state.board)} ${state.turn === "white" ? "w" : "b"} ${rights || "-"} ${normalizedEnPassant(state)}`;
}

function insufficientMaterial(board) {
  const nonKings = Object.entries(board).filter(([, piece]) => typeOf(piece) !== "K");
  if (nonKings.length === 0) return true;
  if (nonKings.some(([, piece]) => "PQR".includes(typeOf(piece)))) return false;
  if (nonKings.length === 1) return true;
  if (nonKings.every(([, piece]) => typeOf(piece) === "B")) {
    const colors = new Set(
      nonKings.map(([cell]) => {
        const value = coords(cell);
        return (value.file + value.rank) % 2;
      }),
    );
    return colors.size === 1;
  }
  return false;
}

export function applyChessMove(state, moveValue) {
  if (state.status !== "playing") {
    return { ok: false, code: "game_over", error: "The game is already over." };
  }
  const normalized = String(moveValue || "").trim().toLowerCase();
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(normalized)) {
    return { ok: false, code: "invalid_move", error: "Use UCI notation such as e2e4." };
  }
  const move = generateChessLegalMoves(state).find((candidate) => uci(candidate) === normalized);
  if (!move) {
    return { ok: false, code: "illegal_move", error: `${normalized} is not legal.` };
  }

  let next = moveCore(state, move);
  const givesCheck = isChessInCheck(next, next.turn);
  const replyMoves = generateChessLegalMoves(next);
  let status = "playing";
  let winner = null;
  let resultReason = null;

  if (replyMoves.length === 0) {
    if (givesCheck) {
      status = "won";
      winner = state.turn;
      resultReason = "checkmate";
    } else {
      status = "draw";
      resultReason = "stalemate";
    }
  } else if (insufficientMaterial(next.board)) {
    status = "draw";
    resultReason = "insufficient_material";
  }

  const key = positionKey(next);
  const counts = { ...state.positionCounts, [key]: (state.positionCounts[key] || 0) + 1 };
  if (status === "playing" && counts[key] >= 3) {
    status = "draw";
    resultReason = "threefold_repetition";
  }
  if (status === "playing" && next.halfmoveClock >= 100) {
    status = "draw";
    resultReason = "fifty_move";
  }

  const historyMove = {
    number: state.moves.length + 1,
    side: state.turn,
    move: normalized,
    from: move.from,
    to: move.to,
    piece: move.piece,
    capture: move.capture || null,
    promotion: move.promotion || null,
    check: givesCheck,
  };
  next = {
    ...next,
    moves: [...state.moves, historyMove],
    positionHistory: [...state.positionHistory, key],
    positionCounts: counts,
    status,
    winner,
    resultReason,
    revision: state.revision + 1,
  };
  return { ok: true, state: next, move: historyMove };
}

export function analyzeChess(state) {
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
  const legal = generateChessLegalMoves(state);
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
    const value = uci(move);
    const next = moveCore(state, move);
    const check = isChessInCheck(next, next.turn);
    const replies = generateChessLegalMoves(next);
    const mate = check && replies.length === 0;
    const threats = opponentThreats(next, replies, move.to);
    details[value] = {
      from: move.from,
      to: move.to,
      piece: move.piece,
      capture: move.capture || null,
      promotion: move.promotion || null,
      castle: move.castle || null,
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
  const values = legal.map(uci);
  return {
    legalMoves: values,
    moveDetails: details,
    tactical: {
      captures,
      checks,
      mates_in_one: mates,
      mandatory_responses: isChessInCheck(state) ? values : [],
      candidate_safety: candidateSafety,
    },
  };
}

export function resignChess(state, side) {
  if (state.status !== "playing" || !SIDES.includes(side)) return state;
  return {
    ...state,
    status: "won",
    winner: opposite(side),
    resultReason: "resignation",
    revision: state.revision + 1,
  };
}

export function chessPerft(state, depth) {
  if (depth === 0) return 1;
  let nodes = 0;
  for (const move of generateChessLegalMoves(state)) {
    nodes += chessPerft(moveCore(state, move), depth - 1);
  }
  return nodes;
}

export const chessInternals = Object.freeze({
  attacksSquare,
  insufficientMaterial,
  moveCore,
  positionKey,
  pseudoMoves,
  uci,
});
