import {
  actorForStone,
  analyzePosition as analyzeRenju,
  applyMove as applyRenjuMove,
  createGame as createRenjuGame,
  occupiedCells,
} from "./renju-engine.mjs";
import {
  analyzeChess,
  applyChessMove,
  chessFen,
  createChessGame,
  isChessInCheck,
  resignChess,
} from "./chess-engine.mjs";
import {
  analyzeXiangqi,
  applyXiangqiMove,
  createXiangqiGame,
  isXiangqiInCheck,
  resignXiangqi,
  xiangqiFen,
} from "./xiangqi-engine.mjs";

export const PROTOCOL = "human-agent-qipai/v1";

function oppositeRenju(stone) {
  return stone === "black" ? "white" : "black";
}

function actorForSide(state, side) {
  return state.humanSide === side ? "human" : "agent";
}

function genericResult(state, actorResolver) {
  if (state.status === "won") {
    const winnerSide =
      typeof state.winner === "string" ? state.winner : state.winner?.stone;
    return {
      outcome: "win",
      winner: {
        side: winnerSide,
        actor: actorResolver(winnerSide),
      },
      reason: state.resultReason || "win",
    };
  }
  if (state.status === "draw") {
    return { outcome: "draw", winner: null, reason: state.resultReason || "draw" };
  }
  return null;
}

const renju = {
  id: "renju",
  label: "连珠",
  aliases: ["五子棋", "连珠", "gomoku", "renju"],
  sides: ["black", "white"],
  defaultHumanSide: "black",
  renderer: "renju",
  create({ humanSide, revision = 0 } = {}) {
    return createRenjuGame({
      humanStone: humanSide === "white" ? "white" : "black",
      revision,
    });
  },
  activeActor(state) {
    return state.status === "playing" ? actorForStone(state, state.turn) : null;
  },
  apply(state, action) {
    if (action?.type !== "move") {
      return { ok: false, code: "invalid_action", error: "Renju expects a move action." };
    }
    return applyRenjuMove(state, action.value);
  },
  resign(state, side) {
    if (state.status !== "playing" || !this.sides.includes(side)) return state;
    const winner = oppositeRenju(side);
    return {
      ...state,
      status: "won",
      winner: { stone: winner, actor: actorForStone(state, winner) },
      resultReason: "resignation",
      revision: state.revision + 1,
    };
  },
  view(state, viewer = "public") {
    const analysis = analyzeRenju(state);
    const legalMoves = analysis.legal_moves;
    return {
      game: this.id,
      game_label: this.label,
      renderer: this.renderer,
      viewer,
      phase: state.status === "playing" ? "play" : "finished",
      status: state.status,
      revision: state.revision,
      active_actor: this.activeActor(state),
      turn:
        state.status === "playing"
          ? {
              side: state.turn,
              actor: actorForStone(state, state.turn),
              in_check: false,
            }
          : null,
      roles: { human: state.humanStone, agent: state.agentStone },
      view: {
        board: { kind: "intersections", width: 15, height: 15 },
        pieces: occupiedCells(state),
      },
      position: state.moves.map((move) => move.cell).join(" "),
      history: state.moves.map(({ number, cell, stone, actor }) => ({
        number,
        action: { type: "move", value: cell },
        side: stone,
        actor,
        from: null,
        to: cell,
        piece: stone,
        capture: null,
        check: false,
      })),
      legal_actions: legalMoves.map((value) => ({ type: "move", value })),
      legal_moves: legalMoves,
      move_details: {},
      tactical: {
        ...analysis.tactical,
        captures: [],
        checks: [],
        mates_in_one: analysis.tactical.immediate_wins,
        mandatory_responses: analysis.tactical.mandatory_blocks,
      },
      forbidden_moves: analysis.forbidden_moves,
      result:
        state.status === "won"
          ? {
              outcome: "win",
              winner: {
                side: state.winner.stone,
                actor: state.winner.actor,
              },
              reason: state.resultReason || "five",
              winning_line: state.winningLine,
            }
          : state.status === "draw"
            ? { outcome: "draw", winner: null, reason: "board_full", winning_line: [] }
            : null,
    };
  },
};

function fullInformationAdapter(config) {
  return {
    ...config,
    activeActor(state) {
      return state.status === "playing" ? actorForSide(state, state.turn) : null;
    },
    view(state, viewer = "public") {
      const analysis = config.analyze(state);
      const activeActor = this.activeActor(state);
      return {
        game: config.id,
        game_label: config.label,
        renderer: config.renderer,
        viewer,
        phase: state.status === "playing" ? "play" : "finished",
        status: state.status,
        revision: state.revision,
        active_actor: activeActor,
        turn:
          state.status === "playing"
            ? {
                side: state.turn,
                actor: activeActor,
                in_check: config.inCheck(state),
              }
            : null,
        roles: { human: state.humanSide, agent: state.agentSide },
        view: {
          board: config.board,
          pieces: { ...state.board },
        },
        position: config.position(state),
        history: state.moves.map((move) => ({
          ...move,
          action: { type: "move", value: move.move },
          actor: actorForSide(state, move.side),
        })),
        legal_actions: analysis.legalMoves.map((value) => ({ type: "move", value })),
        legal_moves: analysis.legalMoves,
        move_details: analysis.moveDetails,
        tactical: analysis.tactical,
        forbidden_moves: {},
        result: genericResult(state, (side) => actorForSide(state, side)),
      };
    },
  };
}

const chess = fullInformationAdapter({
  id: "chess",
  label: "国际象棋",
  aliases: ["国际象棋", "西洋棋", "chess"],
  sides: ["white", "black"],
  defaultHumanSide: "white",
  renderer: "chess",
  board: { kind: "squares", width: 8, height: 8 },
  create({ humanSide, revision = 0 } = {}) {
    return createChessGame({
      humanSide: humanSide === "black" ? "black" : "white",
      revision,
    });
  },
  apply(state, action) {
    if (action?.type !== "move") {
      return { ok: false, code: "invalid_action", error: "Chess expects a move action." };
    }
    return applyChessMove(state, action.value);
  },
  resign: resignChess,
  analyze: analyzeChess,
  inCheck: isChessInCheck,
  position: chessFen,
});

const xiangqi = fullInformationAdapter({
  id: "xiangqi",
  label: "中国象棋",
  aliases: ["中国象棋", "象棋", "xiangqi", "chinese chess"],
  sides: ["red", "black"],
  defaultHumanSide: "red",
  renderer: "xiangqi",
  board: { kind: "xiangqi", width: 9, height: 10 },
  create({ humanSide, revision = 0 } = {}) {
    return createXiangqiGame({
      humanSide: humanSide === "black" ? "black" : "red",
      revision,
    });
  },
  apply(state, action) {
    if (action?.type !== "move") {
      return { ok: false, code: "invalid_action", error: "Xiangqi expects a move action." };
    }
    return applyXiangqiMove(state, action.value);
  },
  resign: resignXiangqi,
  analyze: analyzeXiangqi,
  inCheck: isXiangqiInCheck,
  position: xiangqiFen,
});

const registry = new Map([
  [renju.id, renju],
  [chess.id, chess],
  [xiangqi.id, xiangqi],
]);

export function getGameAdapter(id = "renju") {
  return registry.get(String(id).toLowerCase()) || null;
}

export function listGames() {
  return [...registry.values()].map(({ id, label, aliases, defaultHumanSide }) => ({
    id,
    label,
    aliases: [...aliases],
    default_human_side: defaultHumanSide,
  }));
}

export const gameAdapters = Object.freeze({ renju, chess, xiangqi });
