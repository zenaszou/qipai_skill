const GAME_UI = {
  renju: {
    kicker: "LIVE RENJU · 15 × 15",
    caption: "黑方首手固定在 H8；黑方有长连、四四和三三禁手。",
    files: "ABCDEFGHIJKLMNO".split(""),
    ranks: Array.from({ length: 15 }, (_, index) => String(index + 1)),
  },
  chess: {
    kicker: "LIVE CHESS · 8 × 8",
    caption: "完整休闲国际象棋规则；三次重复或 50 回合无进展自动和棋。",
    files: "abcdefgh".split(""),
    ranks: "12345678".split(""),
  },
  xiangqi: {
    kicker: "LIVE XIANGQI · 9 × 10",
    caption: "红方先行；困毙判负，长将循环受到限制。",
    files: "abcdefghi".split(""),
    ranks: "0123456789".split(""),
  },
};

const SIDE_NAMES = {
  black: "黑方",
  white: "白方",
  red: "红方",
};
const ACTOR_NAMES = { human: "你", agent: "Agent" };
const RESULT_NAMES = {
  five: "五连",
  board_full: "满盘",
  checkmate: "将死",
  stalemate: "困毙",
  general_captured: "将帅被擒",
  insufficient_material: "子力不足",
  threefold_repetition: "三次重复",
  fifty_move: "50 回合无进展",
  no_capture_60: "60 手无吃子",
  resignation: "认输",
};
const FORBIDDEN_NAMES = {
  opening_center: "黑方首手必须落在 H8",
  overline: "长连禁手",
  double_four: "四四禁手",
  double_three: "三三禁手",
};
const CHESS_GLYPHS = {
  wK: "♔", wQ: "♕", wR: "♖", wB: "♗", wN: "♘", wP: "♙",
  bK: "♚", bQ: "♛", bR: "♜", bB: "♝", bN: "♞", bP: "♟",
};
const XIANGQI_GLYPHS = {
  rK: "帅", rA: "仕", rE: "相", rH: "马", rR: "车", rC: "炮", rP: "兵",
  bK: "将", bA: "士", bE: "象", bH: "馬", bR: "車", bC: "砲", bP: "卒",
};

const elements = {
  board: document.querySelector("#board"),
  shell: document.querySelector("#board-shell"),
  columns: document.querySelector("#column-labels"),
  rows: document.querySelector("#row-labels"),
  connection: document.querySelector("#connection"),
  roles: document.querySelector("#roles"),
  boardKicker: document.querySelector("#board-kicker"),
  gameTitle: document.querySelector("#game-title"),
  caption: document.querySelector("#board-caption"),
  turnIcon: document.querySelector("#turn-icon"),
  turnHeading: document.querySelector("#turn-heading"),
  turnDetail: document.querySelector("#turn-detail"),
  moveCount: document.querySelector("#move-count"),
  lastMove: document.querySelector("#last-move"),
  revision: document.querySelector("#revision"),
  bridgeTitle: document.querySelector("#bridge-title"),
  bridgeCopy: document.querySelector("#bridge-copy"),
  history: document.querySelector("#history"),
  swap: document.querySelector("#swap"),
  restart: document.querySelector("#restart"),
  resign: document.querySelector("#resign"),
  promotionDialog: document.querySelector("#promotion-dialog"),
  promotionOptions: document.querySelector("#promotion-options"),
  toast: document.querySelector("#toast"),
  screenReaderStatus: document.querySelector("#screen-reader-status"),
};

let state = null;
let selected = null;
let boardSignature = null;
let submitting = false;
let stopped = false;
let toastTimer = null;

function setConnection(kind, label) {
  elements.connection.className = `connection ${kind}`;
  elements.connection.querySelector("span").textContent = label;
}

function showToast(message, kind = "") {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.className = `toast visible ${kind}`;
  toastTimer = setTimeout(() => {
    elements.toast.className = "toast";
  }, 2800);
}

function sideCode(game, side) {
  if (game === "chess") return side === "white" ? "w" : "b";
  if (game === "xiangqi") return side === "red" ? "r" : "b";
  return side;
}

function pieceSide(game, piece) {
  if (!piece) return null;
  if (game === "renju") return piece;
  if (game === "chess") return piece?.[0] === "w" ? "white" : "black";
  return piece?.[0] === "r" ? "red" : "black";
}

function orderedCoordinates(current) {
  const ui = GAME_UI[current.game];
  if (current.game === "renju") {
    return { files: ui.files, ranks: ui.ranks };
  }
  const humanSide = current.roles.human;
  const defaultBottom =
    (current.game === "chess" && humanSide === "white") ||
    (current.game === "xiangqi" && humanSide === "red");
  return {
    files: defaultBottom ? ui.files : [...ui.files].reverse(),
    ranks: defaultBottom ? [...ui.ranks].reverse() : ui.ranks,
  };
}

function rememberSession(current) {
  try {
    localStorage.setItem(
      `human-agent-qipai:${current.session_id}`,
      JSON.stringify({ game: current.game, revision: current.revision, visited_at: Date.now() }),
    );
  } catch {
    // Live state remains server-owned.
  }
}

function buildBoard(current) {
  const { files, ranks } = orderedCoordinates(current);
  const signature = `${current.game}:${current.roles.human}`;
  if (signature === boardSignature) return;
  boardSignature = signature;
  selected = null;

  elements.board.className = `board ${current.renderer}`;
  elements.shell.className = `board-shell ${current.renderer}`;
  elements.board.style.setProperty("--board-columns", String(files.length));
  elements.board.style.setProperty("--board-rows", String(ranks.length));
  elements.columns.style.setProperty("--board-columns", String(files.length));
  elements.rows.style.setProperty("--board-rows", String(ranks.length));
  elements.columns.replaceChildren(
    ...files.map((value) => {
      const label = document.createElement("span");
      label.textContent = value.toUpperCase();
      return label;
    }),
  );
  elements.rows.replaceChildren(
    ...ranks.map((value) => {
      const label = document.createElement("span");
      label.textContent = value;
      return label;
    }),
  );

  const fragment = document.createDocumentFragment();
  ranks.forEach((rank, rowIndex) => {
    files.forEach((file, colIndex) => {
      const coordinate =
        current.game === "renju" ? `${file}${rank}` : `${file}${rank}`;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "cell";
      button.dataset.cell = coordinate;
      button.dataset.row = String(rowIndex);
      button.dataset.col = String(colIndex);
      button.setAttribute("role", "gridcell");
      if (current.game === "renju" || current.game === "xiangqi") {
        if (rowIndex === 0) button.classList.add("edge-top");
        if (rowIndex === ranks.length - 1) button.classList.add("edge-bottom");
        if (colIndex === 0) button.classList.add("edge-left");
        if (colIndex === files.length - 1) button.classList.add("edge-right");
      }
      if (current.game === "renju") {
        if (["D4", "L4", "H8", "D12", "L12"].includes(coordinate)) {
          button.classList.add("star");
        }
      } else if (current.game === "chess") {
        const rankNumber = Number(rank);
        const fileNumber = "abcdefgh".indexOf(file);
        button.classList.add((fileNumber + rankNumber) % 2 ? "dark" : "light");
      }

      const star = document.createElement("i");
      star.className = "star-dot";
      const piece = document.createElement("span");
      piece.className = "piece";
      piece.setAttribute("aria-hidden", "true");
      const marker = document.createElement("span");
      marker.className = "last-marker";
      marker.setAttribute("aria-hidden", "true");
      const target = document.createElement("span");
      target.className = "target-marker";
      target.setAttribute("aria-hidden", "true");
      button.append(star, piece, marker, target);
      button.addEventListener("click", () => handleCellClick(coordinate));
      fragment.append(button);
    });
  });
  elements.board.replaceChildren(fragment);
}

function humanTurn(current) {
  return (
    current.status === "playing" &&
    current.active_actor === "human" &&
    !submitting
  );
}

function legalMovesFrom(current, from) {
  return current.legal_moves.filter((move) => move.startsWith(from));
}

function targetForMove(game, move) {
  if (game === "renju") return move;
  return move.slice(2, 4);
}

function showPromotion(moves) {
  elements.promotionOptions.replaceChildren(
    ...moves.map((move) => {
      const promotion = move.at(-1);
      const button = document.createElement("button");
      button.type = "button";
      button.value = promotion;
      const code = `${sideCode("chess", state.roles.human)}${promotion.toUpperCase()}`;
      button.textContent = CHESS_GLYPHS[code];
      button.setAttribute("aria-label", `升变为 ${promotion.toUpperCase()}`);
      button.addEventListener("click", () => {
        elements.promotionDialog.close();
        submitHumanAction({ type: "move", value: move });
      });
      return button;
    }),
  );
  elements.promotionDialog.showModal();
}

function handleCellClick(coordinate) {
  if (!state || !humanTurn(state)) return;
  if (state.game === "renju") {
    if (state.legal_moves.includes(coordinate)) {
      submitHumanAction({ type: "move", value: coordinate });
    }
    return;
  }

  const piece = state.view.pieces[coordinate];
  const ownPiece = pieceSide(state.game, piece) === state.roles.human;
  if (!selected) {
    if (ownPiece && legalMovesFrom(state, coordinate).length) {
      selected = coordinate;
      renderBoard(state);
    }
    return;
  }

  if (ownPiece) {
    selected = coordinate;
    renderBoard(state);
    return;
  }
  const matches = legalMovesFrom(state, selected).filter(
    (move) => targetForMove(state.game, move) === coordinate,
  );
  if (matches.length === 1) {
    submitHumanAction({ type: "move", value: matches[0] });
  } else if (matches.length > 1 && state.game === "chess") {
    showPromotion(matches);
  } else {
    selected = null;
    renderBoard(state);
  }
}

function glyphFor(current, piece) {
  if (!piece) return "";
  if (current.game === "chess") return CHESS_GLYPHS[piece] || "";
  if (current.game === "xiangqi") return XIANGQI_GLYPHS[piece] || "";
  return "";
}

function renderBoard(current) {
  const legal = new Set(current.legal_moves);
  const humanIsActive = humanTurn(current);
  const last = current.history.at(-1);
  const targetCells = selected
    ? new Set(legalMovesFrom(current, selected).map((move) => targetForMove(current.game, move)))
    : new Set();
  const winning = new Set(current.result?.winning_line || []);
  const inCheckSide = current.turn?.in_check ? current.turn.side : null;

  for (const button of elements.board.querySelectorAll(".cell")) {
    const coordinate = button.dataset.cell;
    const piece = current.view.pieces[coordinate] || null;
    const pieceElement = button.querySelector(".piece");
    pieceElement.textContent = glyphFor(current, piece);
    button.dataset.piece = piece || "";
    button.classList.toggle("black", current.game === "renju" && piece === "black");
    button.classList.toggle("white", current.game === "renju" && piece === "white");
    button.classList.toggle("red-piece", current.game === "xiangqi" && piece?.[0] === "r");
    button.classList.toggle(
      "black-piece",
      (current.game === "xiangqi" || current.game === "chess") && piece?.[0] === "b",
    );
    button.classList.toggle("selected", coordinate === selected);
    button.classList.toggle("target", targetCells.has(coordinate));
    button.classList.toggle("capture-target", targetCells.has(coordinate) && Boolean(piece));
    button.classList.toggle(
      "last",
      coordinate === last?.to || coordinate === last?.action?.value,
    );
    button.classList.toggle("last-from", coordinate === last?.from);
    button.classList.toggle("winning", winning.has(coordinate));
    button.classList.toggle(
      "in-check",
      Boolean(
        inCheckSide &&
        piece &&
        pieceSide(current.game, piece) === inCheckSide &&
        piece.endsWith("K"),
      ),
    );
    const forbidden = current.forbidden_moves[coordinate];
    button.title = forbidden && humanIsActive ? FORBIDDEN_NAMES[forbidden] || forbidden : "";

    if (current.game === "renju") {
      button.disabled = !humanIsActive || !legal.has(coordinate);
    } else {
      const ownPiece = pieceSide(current.game, piece) === current.roles.human;
      const usableSource = ownPiece && legalMovesFrom(current, coordinate).length > 0;
      button.disabled = !humanIsActive || (!usableSource && !targetCells.has(coordinate));
    }
    const label = piece
      ? `${coordinate}，${glyphFor(current, piece) || piece}`
      : `${coordinate}，空位`;
    button.setAttribute("aria-label", label);
  }
  elements.board.classList.toggle("locked", !humanIsActive);
}

function roleIcon(game, side) {
  if (game === "renju") return `<i class="mini-stone ${side}"></i>`;
  const code =
    game === "chess"
      ? `${sideCode(game, side)}K`
      : `${sideCode(game, side)}K`;
  return `<i class="mini-piece ${game} ${side}">${glyphFor({ game }, code)}</i>`;
}

function renderTurn(current) {
  elements.roles.innerHTML = [
    `<span>${roleIcon(current.game, current.roles.human)}你 · ${SIDE_NAMES[current.roles.human]}</span>`,
    "<b>×</b>",
    `<span>${roleIcon(current.game, current.roles.agent)}Agent · ${SIDE_NAMES[current.roles.agent]}</span>`,
  ].join("");
  elements.moveCount.textContent = String(current.history.length);
  elements.lastMove.textContent = current.history.at(-1)?.action?.value || "—";
  elements.revision.textContent = String(current.revision);
  elements.turnIcon.className = `turn-icon ${current.turn?.side || "neutral"} ${current.game}`;
  elements.turnIcon.textContent =
    current.game === "chess" && current.turn
      ? CHESS_GLYPHS[`${sideCode("chess", current.turn.side)}K`]
      : current.game === "xiangqi" && current.turn
        ? XIANGQI_GLYPHS[`${sideCode("xiangqi", current.turn.side)}K`]
        : "";

  if (current.status !== "playing") {
    if (current.result?.outcome === "win") {
      const winner = current.result.winner;
      elements.turnHeading.textContent = `${ACTOR_NAMES[winner.actor]}获胜`;
      elements.turnDetail.textContent = `${SIDE_NAMES[winner.side]} · ${RESULT_NAMES[current.result.reason] || current.result.reason}`;
    } else {
      elements.turnHeading.textContent = "和棋";
      elements.turnDetail.textContent = RESULT_NAMES[current.result?.reason] || "本局结束";
    }
    elements.bridgeTitle.textContent = "对局已经结束";
    elements.bridgeCopy.textContent = "可以交换执子或重新开始。";
    return;
  }

  const { side, actor, in_check: inCheck } = current.turn;
  elements.turnHeading.textContent =
    actor === "human" ? `轮到你 · ${SIDE_NAMES[side]}` : "Agent 正在思考";
  elements.turnDetail.textContent =
    actor === "human"
      ? current.game === "renju" && current.history.length === 0
        ? "黑方首手请落在棋盘中心 H8。"
        : inCheck
          ? "你正在被将军，请选择合法应对。"
          : current.game === "renju"
            ? "棋盘已解锁，请落下一手。"
            : selected
              ? `已选择 ${selected}，请选择目标。`
              : "请选择一个可以行动的棋子。"
      : `你执${SIDE_NAMES[current.roles.human]}，棋盘暂时冻结。`;
  elements.bridgeTitle.textContent = actor === "human" ? "等待你的动作" : "Agent 已收到局面";
  elements.bridgeCopy.textContent =
    actor === "human" ? "操作会直接发送给当前 Agent。" : "Agent 返回动作后，页面会自动更新。";
}

function renderHistory(current) {
  if (!current.history.length) {
    elements.history.innerHTML = '<li class="history-empty">第一步之后，这里会成为共同记忆。</li>';
    return;
  }
  elements.history.replaceChildren(
    ...current.history.slice().reverse().map((entry) => {
      const item = document.createElement("li");
      item.innerHTML = `
        <span class="move-number">${String(entry.number).padStart(2, "0")}</span>
        <span class="history-piece">${entry.capture ? "×" : "·"}</span>
        <strong>${entry.action.value}</strong>
        <small>${ACTOR_NAMES[entry.actor]}</small>
      `;
      return item;
    }),
  );
}

function render(current) {
  state = current;
  rememberSession(current);
  buildBoard(current);
  const ui = GAME_UI[current.game];
  document.title = `${current.game_label} · Human × Agent`;
  elements.boardKicker.textContent = ui.kicker;
  elements.gameTitle.textContent = current.game_label;
  elements.caption.textContent = ui.caption;
  elements.board.setAttribute("aria-label", `${current.game_label}棋盘`);
  renderBoard(current);
  renderTurn(current);
  renderHistory(current);
  elements.swap.disabled = submitting || current.history.length > 0;
  elements.restart.disabled = submitting;
  elements.resign.disabled = submitting || current.status !== "playing";
  setConnection(
    current.active_actor === "agent" ? "thinking" : "online",
    current.active_actor === "agent" ? "Agent 回合" : "实时连接",
  );
}

async function request(path, options) {
  const response = await fetch(path, {
    ...options,
    headers: {
      accept: "application/json",
      ...(options?.body ? { "content-type": "application/json" } : {}),
    },
  });
  const payload = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    const error = new Error(payload?.error || `HTTP ${response.status}`);
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function submitHumanAction(action) {
  if (
    !state ||
    submitting ||
    state.status !== "playing" ||
    (action.type !== "resign" && !humanTurn(state))
  ) return;
  submitting = true;
  render(state);
  try {
    const payload = await request("/api/human-action", {
      method: "POST",
      body: JSON.stringify({ expected_revision: state.revision, action }),
    });
    selected = null;
    render(payload.state);
    elements.screenReaderStatus.textContent = `你执行了 ${action.value || action.type}。`;
  } catch (error) {
    showToast(error.message, "error");
    if (error.payload?.state) render(error.payload.state);
  } finally {
    submitting = false;
    if (state) render(state);
  }
}

async function startNewGame(humanSide) {
  if (!state || submitting) return;
  submitting = true;
  try {
    const payload = await request("/api/new-game", {
      method: "POST",
      body: JSON.stringify({
        expected_revision: state.revision,
        human_side: humanSide,
      }),
    });
    selected = null;
    boardSignature = null;
    render(payload.state);
    showToast(`新对局开始，你执${SIDE_NAMES[humanSide]}。`);
  } catch (error) {
    showToast(error.message, "error");
    if (error.payload?.state) render(error.payload.state);
  } finally {
    submitting = false;
    if (state) render(state);
  }
}

async function pollState() {
  while (!stopped) {
    try {
      if (!state) render(await request("/api/state"));
      else {
        const next = await request(`/api/state?after=${state.revision}`);
        if (next) {
          const previousLength = state.history.length;
          selected = null;
          render(next);
          if (next.history.length > previousLength) {
            elements.screenReaderStatus.textContent =
              `${ACTOR_NAMES[next.history.at(-1).actor]}执行了 ${next.history.at(-1).action.value}。`;
          }
        }
      }
    } catch {
      setConnection("offline", "连接中断");
      await new Promise((resolveWait) => setTimeout(resolveWait, 1200));
    }
  }
}

elements.swap.addEventListener("click", () => {
  if (!state || state.history.length) return;
  const next = state.roles.human === state.roles.agent
    ? state.roles.human
    : state.roles.agent;
  startNewGame(next);
});
elements.restart.addEventListener("click", () => {
  if (state) startNewGame(state.roles.human);
});
elements.resign.addEventListener("click", () => submitHumanAction({ type: "resign" }));
elements.promotionDialog.addEventListener("close", () => {
  if (elements.promotionDialog.returnValue === "cancel") {
    selected = null;
    if (state) renderBoard(state);
  }
});
window.addEventListener("beforeunload", () => {
  stopped = true;
});

pollState();
