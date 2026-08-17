import assert from "node:assert/strict";
import test from "node:test";
import { createQipaiServer } from "../scripts/serve.mjs";

async function withServer(callback, options = {}) {
  const runtime = createQipaiServer({ port: 0, ...options });
  const started = await runtime.start();
  try {
    await callback(started.url.replace(/\/$/, ""), runtime);
  } finally {
    await runtime.close();
  }
}

async function jsonRequest(url, path, options = {}) {
  const response = await fetch(`${url}${path}`, {
    ...options,
    headers: {
      accept: "application/json",
      ...(options.body ? { "content-type": "application/json" } : {}),
    },
  });
  const payload = response.status === 204 ? null : await response.json();
  return { response, payload };
}

async function postAction(url, actor, revision, action, eventId) {
  return jsonRequest(url, `/api/${actor}-action`, {
    method: "POST",
    body: JSON.stringify({
      expected_revision: revision,
      action,
      ...(eventId ? { event_id: eventId } : {}),
    }),
  });
}

test("all registered games route through the generic protocol", async () => {
  const examples = [
    ["renju", "H8", 1],
    ["chess", "e2e4", 20],
    ["xiangqi", "a3a4", 44],
  ];
  for (const [game, firstMove, legalCount] of examples) {
    await withServer(async (url) => {
      const health = await jsonRequest(url, "/api/health");
      assert.equal(health.payload.protocol, "human-agent-qipai/v1");
      assert.equal(health.payload.game, game);
      assert.equal(health.payload.supported_games.length, 3);

      const initial = await jsonRequest(url, "/api/state");
      assert.equal(initial.payload.game, game);
      assert.equal(initial.payload.viewer, "human");
      assert.equal(initial.payload.legal_actions.length, legalCount);

      const human = await postAction(
        url,
        "human",
        0,
        { type: "move", value: firstMove },
      );
      assert.equal(human.response.status, 200, human.payload.error);
      const event = (await jsonRequest(url, "/api/agent-events?after=0")).payload;
      assert.equal(event.type, "agent_turn");
      assert.equal(event.state.viewer, "agent");
      if (game !== "renju") {
        const candidate = event.state.legal_moves[0];
        assert.ok(event.state.move_details[candidate].opponent_threats);
        assert.ok(event.state.tactical.candidate_safety);
      }
      const reply = event.state.legal_actions[0];
      const agent = await postAction(
        url,
        "agent",
        event.revision,
        reply,
        event.event_id,
      );
      assert.equal(agent.response.status, 200, agent.payload.error);
      assert.equal(agent.payload.state.active_actor, "human");
    }, { game });
  }
});

test("illegal retry preserves revision and agent event", async () => {
  await withServer(async (url) => {
    await postAction(url, "human", 0, { type: "move", value: "H8" });
    const event = (await jsonRequest(url, "/api/agent-events?after=0")).payload;
    const illegal = await postAction(
      url,
      "agent",
      event.revision,
      { type: "move", value: "H8" },
      event.event_id,
    );
    assert.equal(illegal.response.status, 422);
    assert.equal(illegal.payload.revision, 1);

    const legal = await postAction(
      url,
      "agent",
      event.revision,
      { type: "move", value: "G8" },
      event.event_id,
    );
    assert.equal(legal.response.status, 200);
    const replay = await postAction(
      url,
      "agent",
      event.revision,
      { type: "move", value: "G9" },
      event.event_id,
    );
    assert.equal(replay.response.status, 409);
  });
});

test("resignation emits game_over and stale revisions do not mutate state", async () => {
  await withServer(async (url) => {
    const resigned = await postAction(url, "human", 0, { type: "resign" });
    assert.equal(resigned.response.status, 200);
    assert.equal(resigned.payload.state.result.reason, "resignation");
    const event = (await jsonRequest(url, "/api/agent-events?after=0")).payload;
    assert.equal(event.type, "game_over");

    const stale = await postAction(url, "human", 0, { type: "move", value: "e2e4" });
    assert.equal(stale.response.status, 409);
    assert.equal(stale.payload.code, "stale_revision");
  }, { game: "chess" });
});

test("the human may resign while an Agent turn is pending", async () => {
  await withServer(async (url) => {
    await postAction(url, "human", 0, { type: "move", value: "e2e4" });
    const resigned = await postAction(url, "human", 1, { type: "resign" });
    assert.equal(resigned.response.status, 200);
    assert.equal(resigned.payload.state.result.winner.actor, "agent");
    assert.equal(resigned.payload.state.result.reason, "resignation");
  }, { game: "chess" });
});

test("new games isolate revisions and old Renju move aliases remain compatible", async () => {
  await withServer(async (url) => {
    const legacy = await jsonRequest(url, "/api/human-move", {
      method: "POST",
      body: JSON.stringify({
        expected_revision: 0,
        action: { action: "place", cell: "H8" },
      }),
    });
    assert.equal(legacy.response.status, 200, legacy.payload.error);
    const reset = await jsonRequest(url, "/api/new-game", {
      method: "POST",
      body: JSON.stringify({ expected_revision: 1, human_stone: "white" }),
    });
    assert.equal(reset.response.status, 200);
    assert.equal(reset.payload.state.revision, 2);
    assert.equal(reset.payload.state.active_actor, "agent");
  });
});

test("each start gets a fresh session and static assets do not expose scripts", async () => {
  let first;
  await withServer(async (url) => {
    first = (await jsonRequest(url, "/api/health")).payload.session_id;
    const page = await fetch(`${url}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /棋牌 · Human × Agent/);
    const traversal = await fetch(`${url}/..%2Fscripts%2Fserve.mjs`);
    assert.equal(traversal.status, 403);
  });
  await withServer(async (url) => {
    const health = (await jsonRequest(url, "/api/health")).payload;
    assert.notEqual(health.session_id, first);
    assert.equal(health.revision, 0);
  });
});

test("viewer-specific adapter views do not cross the protocol boundary", async () => {
  const fake = {
    id: "privacy-test",
    label: "Privacy Test",
    renderer: "cards",
    sides: ["alpha", "beta"],
    defaultHumanSide: "alpha",
    create() {
      return { revision: 0, status: "playing", turn: "alpha", humanSide: "alpha" };
    },
    activeActor(state) {
      return state.turn === "alpha" ? "human" : "agent";
    },
    apply(state) {
      return { ok: true, state: { ...state, revision: 1, turn: "beta" } };
    },
    resign(state) {
      return { ...state, revision: state.revision + 1, status: "won" };
    },
    view(state, viewer) {
      return {
        game: this.id,
        viewer,
        revision: state.revision,
        status: state.status,
        active_actor: this.activeActor(state),
        roles: { human: "alpha", agent: "beta" },
        legal_actions: [{ type: "move", value: "go" }],
        view:
          viewer === "human"
            ? { hand: ["human-secret"] }
            : viewer === "agent"
              ? { hand: ["agent-secret"] }
              : { hand: [] },
      };
    },
  };
  await withServer(async (url) => {
    const human = (await jsonRequest(url, "/api/state")).payload;
    assert.deepEqual(human.view.hand, ["human-secret"]);
    assert.equal(JSON.stringify(human).includes("agent-secret"), false);
    await postAction(url, "human", 0, { type: "move", value: "go" });
    const agent = (await jsonRequest(url, "/api/agent-events?after=0")).payload.state;
    assert.deepEqual(agent.view.hand, ["agent-secret"]);
    assert.equal(JSON.stringify(agent).includes("human-secret"), false);
  }, { adapter: fake });
});

test("closing the service terminates an outstanding long poll", async () => {
  const runtime = createQipaiServer({ port: 0 });
  const started = await runtime.start();
  const pending = fetch(`${started.url}api/agent-events?after=0`).catch(() => null);
  await new Promise((resolveWait) => setTimeout(resolveWait, 20));
  await runtime.close();
  const outcome = await pending;
  assert.equal(outcome === null || outcome.status === 204, true);
});
