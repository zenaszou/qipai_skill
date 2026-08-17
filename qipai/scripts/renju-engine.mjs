export const BOARD_SIZE = 15;
export const COLUMNS = "ABCDEFGHIJKLMNO";
export const DIRECTIONS = Object.freeze([
  Object.freeze([0, 1]),
  Object.freeze([1, 0]),
  Object.freeze([1, 1]),
  Object.freeze([1, -1]),
]);

const CENTER_CELL = "H8";
const TOTAL_CELLS = BOARD_SIZE * BOARD_SIZE;

export function createBoard() {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => null),
  );
}

export function cloneBoard(board) {
  return board.map((row) => row.slice());
}

export function isInside(row, col) {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

export function cellFromPosition(row, col) {
  return isInside(row, col) ? `${COLUMNS[col]}${row + 1}` : null;
}

export function positionFromCell(value) {
  if (typeof value !== "string") return null;
  const match = value.trim().toUpperCase().match(/^([A-O])(1[0-5]|[1-9])$/);
  if (!match) return null;
  return {
    row: Number(match[2]) - 1,
    col: COLUMNS.indexOf(match[1]),
    cell: `${match[1]}${Number(match[2])}`,
  };
}

export function oppositeStone(stone) {
  return stone === "black" ? "white" : "black";
}

export function actorForStone(state, stone) {
  return state.humanStone === stone ? "human" : "agent";
}

export function createGame(options = {}) {
  const humanStone = options.humanStone === "white" ? "white" : "black";
  return {
    board: createBoard(),
    humanStone,
    agentStone: oppositeStone(humanStone),
    turn: "black",
    status: "playing",
    winner: null,
    winningLine: [],
    moves: [],
    revision: Number.isInteger(options.revision) ? options.revision : 0,
  };
}

function boardKey(board) {
  let key = "";
  for (const row of board) {
    for (const value of row) {
      key += value === "black" ? "b" : value === "white" ? "w" : ".";
    }
  }
  return key;
}

function lineThrough(board, row, col, stone, rowStep, colStep) {
  const before = [];
  let cursorRow = row - rowStep;
  let cursorCol = col - colStep;
  while (isInside(cursorRow, cursorCol) && board[cursorRow][cursorCol] === stone) {
    before.unshift([cursorRow, cursorCol]);
    cursorRow -= rowStep;
    cursorCol -= colStep;
  }

  const after = [];
  cursorRow = row + rowStep;
  cursorCol = col + colStep;
  while (isInside(cursorRow, cursorCol) && board[cursorRow][cursorCol] === stone) {
    after.push([cursorRow, cursorCol]);
    cursorRow += rowStep;
    cursorCol += colStep;
  }

  return [...before, [row, col], ...after];
}

function winningLines(board, row, col, stone) {
  const lines = [];
  for (const [rowStep, colStep] of DIRECTIONS) {
    const line = lineThrough(board, row, col, stone, rowStep, colStep);
    if (
      (stone === "black" && line.length === 5) ||
      (stone === "white" && line.length >= 5)
    ) {
      lines.push(line.map(([lineRow, lineCol]) => cellFromPosition(lineRow, lineCol)));
    }
  }
  return lines;
}

function hasOverline(board, row, col) {
  return DIRECTIONS.some(
    ([rowStep, colStep]) =>
      lineThrough(board, row, col, "black", rowStep, colStep).length >= 6,
  );
}

function directionPosition(row, col, rowStep, colStep, offset) {
  return [row + rowStep * offset, col + colStep * offset];
}

function fourStructures(board, originRow, originCol) {
  const structures = new Map();

  DIRECTIONS.forEach(([rowStep, colStep], directionIndex) => {
    for (let start = -4; start <= 0; start += 1) {
      const positions = Array.from({ length: 5 }, (_, index) =>
        directionPosition(
          originRow,
          originCol,
          rowStep,
          colStep,
          start + index,
        ),
      );
      if (positions.some(([row, col]) => !isInside(row, col))) continue;
      if (
        !positions.some(
          ([row, col]) => row === originRow && col === originCol,
        )
      ) {
        continue;
      }

      const values = positions.map(([row, col]) => board[row][col]);
      if (values.filter((value) => value === "black").length !== 4) continue;
      if (values.filter((value) => value === null).length !== 1) continue;

      const emptyIndex = values.indexOf(null);
      const [emptyRow, emptyCol] = positions[emptyIndex];
      const completed = cloneBoard(board);
      completed[emptyRow][emptyCol] = "black";
      if (
        lineThrough(
          completed,
          emptyRow,
          emptyCol,
          "black",
          rowStep,
          colStep,
        ).length !== 5
      ) {
        continue;
      }

      const stones = positions
        .filter((_, index) => index !== emptyIndex)
        .map(([row, col]) => cellFromPosition(row, col))
        .sort();
      const id = `${directionIndex}:${stones.join(",")}`;
      const structure = structures.get(id) || {
        direction: directionIndex,
        stones,
        completions: [],
      };
      structure.completions.push(cellFromPosition(emptyRow, emptyCol));
      structures.set(id, structure);
    }
  });

  return [...structures.values()];
}

function apparentThreeStructures(board, originRow, originCol) {
  const structures = new Map();

  DIRECTIONS.forEach(([rowStep, colStep], directionIndex) => {
    for (let start = -4; start <= -1; start += 1) {
      const positions = Array.from({ length: 6 }, (_, index) =>
        directionPosition(
          originRow,
          originCol,
          rowStep,
          colStep,
          start + index,
        ),
      );
      if (positions.some(([row, col]) => !isInside(row, col))) continue;

      const middle = positions.slice(1, 5);
      if (
        !middle.some(
          ([row, col]) => row === originRow && col === originCol,
        )
      ) {
        continue;
      }
      if (board[positions[0][0]][positions[0][1]] !== null) continue;
      if (board[positions[5][0]][positions[5][1]] !== null) continue;

      const middleValues = middle.map(([row, col]) => board[row][col]);
      if (middleValues.filter((value) => value === "black").length !== 3) continue;
      if (middleValues.filter((value) => value === null).length !== 1) continue;

      const extensionIndex = middleValues.indexOf(null);
      const [extensionRow, extensionCol] = middle[extensionIndex];
      const stones = middle
        .filter((_, index) => index !== extensionIndex)
        .map(([row, col]) => cellFromPosition(row, col))
        .sort();
      const id = `${directionIndex}:${stones.join(",")}`;
      const structure = structures.get(id) || {
        direction: directionIndex,
        stones,
        extensions: [],
      };
      const extension = cellFromPosition(extensionRow, extensionCol);
      if (!structure.extensions.includes(extension)) {
        structure.extensions.push(extension);
      }
      structures.set(id, structure);
    }
  });

  return [...structures.values()];
}

class BlackLegalityEvaluator {
  constructor() {
    this.memo = new Map();
  }

  analyze(board, row, col, options = {}) {
    if (!isInside(row, col) || board[row][col] !== null) {
      return {
        legal: false,
        win: false,
        reason: "occupied",
        details: { four_count: 0, apparent_three_count: 0, real_three_count: 0 },
      };
    }

    const openingRequired = options.openingRequired === true;
    const key = `${boardKey(board)}:${row},${col}:${openingRequired ? "o" : "n"}`;
    const cached = this.memo.get(key);
    if (cached) return cached;

    if (openingRequired && cellFromPosition(row, col) !== CENTER_CELL) {
      const result = {
        legal: false,
        win: false,
        reason: "opening_center",
        details: { four_count: 0, apparent_three_count: 0, real_three_count: 0 },
      };
      this.memo.set(key, result);
      return result;
    }

    const nextBoard = cloneBoard(board);
    nextBoard[row][col] = "black";
    const exactFives = winningLines(nextBoard, row, col, "black");

    // RIF 9.2: a black five takes precedence over forbidden-move tests.
    if (exactFives.length > 0) {
      const result = {
        legal: true,
        win: true,
        reason: null,
        winningLine: exactFives[0],
        details: { four_count: 0, apparent_three_count: 0, real_three_count: 0 },
      };
      this.memo.set(key, result);
      return result;
    }

    if (hasOverline(nextBoard, row, col)) {
      const result = {
        legal: false,
        win: false,
        reason: "overline",
        details: { four_count: 0, apparent_three_count: 0, real_three_count: 0 },
      };
      this.memo.set(key, result);
      return result;
    }

    const fours = fourStructures(nextBoard, row, col);
    if (fours.length >= 2) {
      const result = {
        legal: false,
        win: false,
        reason: "double_four",
        details: {
          four_count: fours.length,
          apparent_three_count: 0,
          real_three_count: 0,
        },
      };
      this.memo.set(key, result);
      return result;
    }

    const apparentThrees = apparentThreeStructures(nextBoard, row, col);
    const realThrees = [];

    for (const three of apparentThrees) {
      const legalExtensions = [];
      for (const extensionCell of three.extensions) {
        const extension = positionFromCell(extensionCell);
        const extensionAnalysis = this.analyze(
          nextBoard,
          extension.row,
          extension.col,
        );
        if (extensionAnalysis.legal) legalExtensions.push(extensionCell);
      }
      if (legalExtensions.length > 0) {
        realThrees.push({ ...three, legal_extensions: legalExtensions });
      }
    }

    const result =
      realThrees.length >= 2
        ? {
            legal: false,
            win: false,
            reason: "double_three",
            details: {
              four_count: fours.length,
              apparent_three_count: apparentThrees.length,
              real_three_count: realThrees.length,
            },
          }
        : {
            legal: true,
            win: false,
            reason: null,
            details: {
              four_count: fours.length,
              apparent_three_count: apparentThrees.length,
              real_three_count: realThrees.length,
            },
          };

    this.memo.set(key, result);
    return result;
  }
}

export function analyzeBlackMove(board, cellValue, options = {}) {
  const position = positionFromCell(cellValue);
  if (!position) {
    return {
      legal: false,
      win: false,
      reason: "invalid_coordinate",
      details: { four_count: 0, apparent_three_count: 0, real_three_count: 0 },
    };
  }
  const evaluator = options.evaluator || new BlackLegalityEvaluator();
  return evaluator.analyze(board, position.row, position.col, {
    openingRequired: options.openingRequired,
  });
}

function analyzeWhiteMove(board, row, col) {
  if (!isInside(row, col) || board[row][col] !== null) {
    return { legal: false, win: false, reason: "occupied" };
  }
  const nextBoard = cloneBoard(board);
  nextBoard[row][col] = "white";
  const lines = winningLines(nextBoard, row, col, "white");
  return {
    legal: true,
    win: lines.length > 0,
    reason: null,
    winningLine: lines[0] || [],
  };
}

export function analyzeMove(board, cellValue, stone, options = {}) {
  const position = positionFromCell(cellValue);
  if (!position) {
    return { legal: false, win: false, reason: "invalid_coordinate" };
  }
  if (stone === "black") {
    return analyzeBlackMove(board, position.cell, options);
  }
  if (stone === "white") {
    return analyzeWhiteMove(board, position.row, position.col);
  }
  return { legal: false, win: false, reason: "invalid_stone" };
}

export function applyMove(state, cellValue) {
  if (!state || state.status !== "playing") {
    return { ok: false, code: "game_over", error: "The game is already over." };
  }

  const position = positionFromCell(cellValue);
  if (!position) {
    return {
      ok: false,
      code: "invalid_coordinate",
      error: "Use a coordinate from A1 through O15.",
    };
  }
  if (state.board[position.row][position.col] !== null) {
    return {
      ok: false,
      code: "occupied",
      error: `${position.cell} is occupied.`,
    };
  }

  const stone = state.turn;
  const analysis = analyzeMove(state.board, position.cell, stone, {
    openingRequired: stone === "black" && state.moves.length === 0,
  });
  if (!analysis.legal) {
    return {
      ok: false,
      code: analysis.reason,
      error: forbiddenReasonLabel(analysis.reason),
      analysis,
    };
  }

  const board = cloneBoard(state.board);
  board[position.row][position.col] = stone;
  const actor = actorForStone(state, stone);
  const move = {
    number: state.moves.length + 1,
    cell: position.cell,
    row: position.row,
    col: position.col,
    stone,
    actor,
  };
  const moves = [...state.moves, move];
  const isWon = analysis.win;
  const isDraw = !isWon && moves.length === TOTAL_CELLS;

  return {
    ok: true,
    move,
    state: {
      ...state,
      board,
      moves,
      turn: isWon || isDraw ? stone : oppositeStone(stone),
      status: isWon ? "won" : isDraw ? "draw" : "playing",
      winner: isWon ? { stone, actor } : null,
      winningLine: isWon ? analysis.winningLine : [],
      revision: state.revision + 1,
    },
  };
}

export function forbiddenReasonLabel(reason) {
  return (
    {
      opening_center: "Black's first move must be H8.",
      overline: "Black may not make an overline.",
      double_four: "Black may not make a double-four.",
      double_three: "Black may not make a forbidden double-three.",
      occupied: "That intersection is occupied.",
      invalid_coordinate: "Use a coordinate from A1 through O15.",
    }[reason] || "That move is not legal."
  );
}

function allEmptyCells(board) {
  const cells = [];
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      if (board[row][col] === null) cells.push(cellFromPosition(row, col));
    }
  }
  return cells;
}

export function analyzePosition(state) {
  if (state.status !== "playing") {
    return {
      legal_moves: [],
      forbidden_moves: {},
      tactical: { immediate_wins: [], mandatory_blocks: [] },
    };
  }

  const emptyCells = allEmptyCells(state.board);
  const legalMoves = [];
  const forbiddenMoves = {};
  const immediateWins = [];
  const evaluator = state.turn === "black" ? new BlackLegalityEvaluator() : null;

  for (const cell of emptyCells) {
    const analysis = analyzeMove(state.board, cell, state.turn, {
      openingRequired: state.turn === "black" && state.moves.length === 0,
      evaluator,
    });
    if (analysis.legal) {
      legalMoves.push(cell);
      if (analysis.win) immediateWins.push(cell);
    } else {
      forbiddenMoves[cell] = analysis.reason;
    }
  }

  const opponent = oppositeStone(state.turn);
  const opponentEvaluator = opponent === "black" ? new BlackLegalityEvaluator() : null;
  const mandatoryBlocks = [];
  for (const cell of emptyCells) {
    const analysis = analyzeMove(state.board, cell, opponent, {
      openingRequired: opponent === "black" && state.moves.length === 0,
      evaluator: opponentEvaluator,
    });
    if (analysis.legal && analysis.win) mandatoryBlocks.push(cell);
  }

  return {
    legal_moves: legalMoves,
    forbidden_moves: forbiddenMoves,
    tactical: {
      immediate_wins: immediateWins,
      mandatory_blocks: mandatoryBlocks,
    },
  };
}

export function occupiedCells(state) {
  return Object.fromEntries(state.moves.map((move) => [move.cell, move.stone]));
}

export function publicState(state, sessionId, analysis = analyzePosition(state)) {
  return {
    protocol: "human-agent-qipai/v1",
    session_id: sessionId,
    revision: state.revision,
    status: state.status,
    turn:
      state.status === "playing"
        ? {
            stone: state.turn,
            actor: actorForStone(state, state.turn),
          }
        : null,
    roles: {
      human: state.humanStone,
      agent: state.agentStone,
    },
    moves: state.moves.map(({ number, cell, stone, actor }) => ({
      number,
      cell,
      stone,
      actor,
    })),
    occupied: occupiedCells(state),
    legal_moves: analysis.legal_moves,
    forbidden_moves: analysis.forbidden_moves,
    tactical: analysis.tactical,
    result:
      state.status === "won"
        ? {
            outcome: "win",
            winner: state.winner,
            winning_line: state.winningLine,
          }
        : state.status === "draw"
          ? { outcome: "draw", winner: null, winning_line: [] }
          : null,
  };
}

export const __testing = Object.freeze({
  BlackLegalityEvaluator,
  apparentThreeStructures,
  fourStructures,
  hasOverline,
  winningLines,
});
