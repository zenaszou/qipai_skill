#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { getGameAdapter, listGames, PROTOCOL } from "./game-registry.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const STATIC_ROOT = resolve(SCRIPT_DIR, "..", "assets", "app");
const MAX_BODY_BYTES = 64 * 1024;
const LONG_POLL_MS = 25_000;
const MAX_EVENTS = 300;
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function parseArguments(argv) {
  const options = { host: "127.0.0.1", port: 4173, game: "renju", humanSide: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--host") options.host = argv[++index];
    else if (argument === "--port") options.port = Number(argv[++index]);
    else if (argument === "--game") options.game = argv[++index];
    else if (argument === "--human" || argument === "--human-side") {
      options.humanSide = argv[++index];
    } else if (argument === "--help" || argument === "-h") {
      process.stdout.write(
        "Usage: node scripts/serve.mjs [--game renju|chess|xiangqi] [--port 4173] [--human <side>]\n",
      );
      process.exit(0);
    } else throw new Error(`Unknown argument: ${argument}`);
  }
  const adapter = getGameAdapter(options.game);
  if (!adapter) throw new Error(`Unsupported game: ${options.game}`);
  if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535) {
    throw new Error("--port must be an integer from 0 through 65535");
  }
  if (options.humanSide && !adapter.sides.includes(options.humanSide)) {
    throw new Error(`--human must be one of: ${adapter.sides.join(", ")}`);
  }
  return options;
}

function sendJson(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
    "content-type": "application/json; charset=utf-8",
  });
  response.end(body);
}

function sendEmpty(response, status = 204) {
  response.writeHead(status, { "cache-control": "no-store" });
  response.end();
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error("Request body is too large.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.statusCode = 400;
    throw error;
  }
}

function waiterSet() {
  const waiters = new Set();
  return {
    notify() {
      for (const wake of waiters) wake();
      waiters.clear();
    },
    wait(request, timeoutMs = LONG_POLL_MS) {
      return new Promise((resolveWait) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          waiters.delete(finish);
          resolveWait();
        };
        const timer = setTimeout(finish, timeoutMs);
        waiters.add(finish);
        request.once("aborted", finish);
      });
    },
    close() {
      for (const wake of waiters) wake();
      waiters.clear();
    },
  };
}

function normalizeAction(payload, legacy = false) {
  if (payload?.action && typeof payload.action === "object") {
    if (payload.action.type) return payload.action;
    if (legacy && payload.action.action === "place" && payload.action.cell) {
      return { type: "move", value: payload.action.cell };
    }
  }
  const value =
    payload?.move ||
    payload?.cell ||
    (legacy && payload?.action?.cell) ||
    null;
  return value ? { type: "move", value } : null;
}

export function createQipaiServer(options = {}) {
  const adapter = options.adapter || getGameAdapter(options.game || "renju");
  if (!adapter) throw new Error(`Unsupported game: ${options.game}`);
  const host = options.host || "127.0.0.1";
  const port = Number.isInteger(options.port) ? options.port : 4173;
  const sessionId = randomUUID();
  let state = adapter.create({
    humanSide: options.humanSide || adapter.defaultHumanSide,
  });
  let nextEventId = 1;
  const events = [];
  const consumedEventIds = new Set();
  const eventWaiters = waiterSet();
  const stateWaiters = waiterSet();
  const viewCache = new Map();

  function snapshot(viewer) {
    const key = `${state.revision}:${viewer}`;
    if (!viewCache.has(key)) {
      viewCache.set(key, {
        protocol: PROTOCOL,
        session_id: sessionId,
        ...adapter.view(state, viewer),
      });
    }
    return viewCache.get(key);
  }

  function clearCache() {
    viewCache.clear();
  }

  function enqueue(type) {
    const event = {
      protocol: PROTOCOL,
      session_id: sessionId,
      event_id: nextEventId++,
      revision: state.revision,
      type,
      created_at: new Date().toISOString(),
      state: snapshot("agent"),
    };
    events.push(event);
    if (events.length > MAX_EVENTS) events.shift();
    eventWaiters.notify();
    return event;
  }

  function publishTransition() {
    clearCache();
    stateWaiters.notify();
    if (state.status !== "playing") return enqueue("game_over");
    if (adapter.activeActor(state) === "agent") return enqueue("agent_turn");
    return null;
  }

  if (adapter.activeActor(state) === "agent") enqueue("agent_turn");

  function eventAfter(after) {
    return events.find((event) => event.event_id > after) || null;
  }

  async function handleState(request, response, url) {
    const afterValue = url.searchParams.get("after");
    if (afterValue === null) {
      sendJson(response, 200, snapshot("human"));
      return;
    }
    const after = Number(afterValue);
    if (!Number.isInteger(after) || after < 0) {
      sendJson(response, 400, { ok: false, error: "after must be a non-negative revision" });
      return;
    }
    if (state.revision <= after) await stateWaiters.wait(request);
    if (state.revision > after) sendJson(response, 200, snapshot("human"));
    else sendEmpty(response);
  }

  async function handleAgentEvent(request, response, url) {
    const after = Number(url.searchParams.get("after") || 0);
    if (!Number.isInteger(after) || after < 0) {
      sendJson(response, 400, { ok: false, error: "after must be a non-negative event id" });
      return;
    }
    let event = eventAfter(after);
    if (!event) {
      await eventWaiters.wait(request);
      event = eventAfter(after);
    }
    if (event) sendJson(response, 200, event);
    else sendEmpty(response);
  }

  async function handleAction(request, response, actor, legacy = false) {
    const payload = await readJson(request);
    const expectedRevision = Number(payload.expected_revision);
    const eventId = Number(payload.event_id);
    const action = normalizeAction(payload, legacy);

    if (!Number.isInteger(expectedRevision) || !action?.type) {
      sendJson(response, 400, {
        ok: false,
        error: "expected_revision and action are required",
      });
      return;
    }
    if (state.revision !== expectedRevision) {
      sendJson(response, 409, {
        ok: false,
        code: "stale_revision",
        error: `Expected revision ${state.revision}; received ${expectedRevision}.`,
        state: snapshot(actor),
      });
      return;
    }
    if (
      state.status !== "playing" ||
      (action.type !== "resign" && adapter.activeActor(state) !== actor)
    ) {
      sendJson(response, 409, {
        ok: false,
        code: "wrong_turn",
        error: `It is not ${actor}'s turn.`,
        state: snapshot(actor),
      });
      return;
    }
    if (actor === "agent") {
      const event = events.find((candidate) => candidate.event_id === eventId);
      if (!Number.isInteger(eventId) || !event || event.type !== "agent_turn") {
        sendJson(response, 409, {
          ok: false,
          code: "unknown_event",
          error: `Agent-turn event ${eventId} is not available.`,
        });
        return;
      }
      if (consumedEventIds.has(eventId)) {
        sendJson(response, 409, {
          ok: false,
          code: "event_consumed",
          error: `Agent-turn event ${eventId} was already consumed.`,
        });
        return;
      }
      if (event.revision !== state.revision) {
        sendJson(response, 409, {
          ok: false,
          code: "stale_event",
          error: `Agent-turn event ${eventId} belongs to revision ${event.revision}.`,
        });
        return;
      }
    }

    let result;
    if (action.type === "resign") {
      const side = snapshot(actor).roles[actor];
      result = {
        ok: true,
        state: adapter.resign(state, side),
        action: { type: "resign", side },
      };
    } else {
      result = adapter.apply(state, action);
    }
    if (!result.ok) {
      sendJson(response, 422, {
        ok: false,
        code: result.code,
        error: result.error,
        revision: state.revision,
      });
      return;
    }

    if (actor === "agent") consumedEventIds.add(eventId);
    state = result.state;
    const emitted = publishTransition();
    sendJson(response, 200, {
      ok: true,
      action: result.action || { type: "move", value: result.move?.move || result.move?.cell },
      move: result.move || null,
      revision: state.revision,
      event_id: emitted?.event_id || null,
      state: snapshot(actor),
    });
  }

  async function handleNewGame(request, response) {
    const payload = await readJson(request);
    const expectedRevision = Number(payload.expected_revision);
    const humanSide = payload.human_side || payload.human_stone;
    if (!Number.isInteger(expectedRevision) || expectedRevision !== state.revision) {
      sendJson(response, 409, {
        ok: false,
        code: "stale_revision",
        error: `Expected revision ${state.revision}.`,
        state: snapshot("human"),
      });
      return;
    }
    if (!adapter.sides.includes(humanSide)) {
      sendJson(response, 400, {
        ok: false,
        error: `human_side must be one of: ${adapter.sides.join(", ")}`,
      });
      return;
    }
    state = adapter.create({ humanSide, revision: state.revision + 1 });
    const emitted = publishTransition();
    sendJson(response, 200, {
      ok: true,
      event_id: emitted?.event_id || null,
      state: snapshot("human"),
    });
  }

  async function serveStatic(request, response, url) {
    const relativePath =
      url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
    const filePath = resolve(STATIC_ROOT, relativePath);
    if (filePath !== STATIC_ROOT && !filePath.startsWith(`${STATIC_ROOT}${sep}`)) {
      sendJson(response, 403, { ok: false, error: "forbidden" });
      return;
    }
    try {
      const metadata = await stat(filePath);
      if (!metadata.isFile()) throw new Error("not a file");
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-length": metadata.size,
        "content-type": MIME_TYPES[extname(filePath)] || "application/octet-stream",
      });
      if (request.method === "HEAD") response.end();
      else createReadStream(filePath).pipe(response);
    } catch {
      sendJson(response, 404, { ok: false, error: "not found" });
    }
  }

  const server = createServer(async (request, response) => {
    const url = new URL(request.url || "/", `http://${request.headers.host || host}`);
    try {
      if (request.method === "GET" && url.pathname === "/api/health") {
        sendJson(response, 200, {
          ok: true,
          protocol: PROTOCOL,
          session_id: sessionId,
          game: adapter.id,
          revision: state.revision,
          supported_games: listGames(),
        });
      } else if (request.method === "GET" && url.pathname === "/api/state") {
        await handleState(request, response, url);
      } else if (request.method === "GET" && url.pathname === "/api/agent-events") {
        await handleAgentEvent(request, response, url);
      } else if (request.method === "POST" && url.pathname === "/api/human-action") {
        await handleAction(request, response, "human");
      } else if (request.method === "POST" && url.pathname === "/api/agent-action") {
        await handleAction(request, response, "agent");
      } else if (request.method === "POST" && url.pathname === "/api/human-move") {
        await handleAction(request, response, "human", true);
      } else if (request.method === "POST" && url.pathname === "/api/agent-move") {
        await handleAction(request, response, "agent", true);
      } else if (request.method === "POST" && url.pathname === "/api/resign") {
        await handleAction(request, response, "human");
      } else if (request.method === "POST" && url.pathname === "/api/new-game") {
        await handleNewGame(request, response);
      } else if (request.method === "GET" || request.method === "HEAD") {
        await serveStatic(request, response, url);
      } else sendJson(response, 405, { ok: false, error: "method not allowed" });
    } catch (error) {
      sendJson(response, error.statusCode || 500, {
        ok: false,
        error: error instanceof Error ? error.message : "internal error",
      });
    }
  });

  return {
    host,
    port,
    game: adapter.id,
    sessionId,
    server,
    start() {
      return new Promise((resolveStart, rejectStart) => {
        server.once("error", rejectStart);
        server.listen(port, host, () => {
          server.off("error", rejectStart);
          const address = server.address();
          const actualPort = address && typeof address === "object" ? address.port : port;
          resolveStart({
            host,
            port: actualPort,
            url: `http://${host}:${actualPort}/`,
            session_id: sessionId,
            game: adapter.id,
          });
        });
      });
    },
    close() {
      eventWaiters.close();
      stateWaiters.close();
      return new Promise((resolveClose) => {
        server.close(resolveClose);
        server.closeAllConnections?.();
      });
    },
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const runtime = createQipaiServer(options);
  const started = await runtime.start();
  process.stdout.write(`${JSON.stringify({ type: "ready", protocol: PROTOCOL, ...started })}\n`);
  const shutdown = () => runtime.close().finally(() => process.exit(0));
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exit(1);
  });
}
