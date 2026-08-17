---
name: qipai
description: Start and play a live turn-based board game with a human through one shared local HTML GUI and a Node.js event bridge. Use only for real-time play intent such as “我想下五子棋”, “来盘国际象棋”, “陪我下象棋”, play Renju/Gomoku, play Chess, or play Xiangqi/Chinese Chess. Do not use for rule questions, position or game-record analysis, or unsupported games such as Go. Requires Node.js 18+ and a terminal task that can remain active until the game ends or the human cancels.
---

# Qipai · Human × Agent

Play one live game with one local human. Both participants act on the same browser state: a human click immediately creates an Agent event, and an Agent action immediately updates the page. Keep this task alive throughout the game. Do not ask the human to report moves in chat.

## Route the requested game

Choose exactly one registered game from the user's play intent:

| User aliases | `--game` | Default human side |
| --- | --- | --- |
| 五子棋, 连珠, Gomoku, Renju | `renju` | black |
| 国际象棋, 西洋棋, Chess | `chess` | white |
| 中国象棋, 象棋, Xiangqi, Chinese Chess | `xiangqi` | red |

“五子棋” means strict Renju in this Skill. If no registered game is named, ask which supported game they want. If they name an unsupported game, say it is not supported; do not launch another mode.

## Start the shared game

1. Resolve `<skill-dir>` to the directory containing this `SKILL.md`.
2. Start the server in a persistent terminal:

   ```bash
   node <skill-dir>/scripts/serve.mjs --game <renju|chess|xiangqi> --port 4173
   ```

3. Read the one-line `ready` JSON from stdout and give the human its exact `url` once without ending the task. If port 4173 is occupied, restart with `--port 0` and use the assigned URL.
4. Leave that terminal running. Do not use Sites, cloud hosting, a daemon, or a vendor-specific browser-control dependency.

The page may exchange sides before the first action. If this makes the Agent the opening side, an `agent_turn` event is emitted immediately.

## Run the turn loop

Track the latest processed `event_id`, starting at `0`.

1. Wait for the next event:

   ```bash
   node <skill-dir>/scripts/game-client.mjs wait --url <url> --after <event-id>
   ```

   This long-polls until it prints one compact JSON event. If the terminal host yields a running-session handle, continue that same handle rather than creating duplicate waits.

2. If `type` is `game_over`, stop the server and return one short result.
3. If `type` is `agent_turn`, choose one action from `state.legal_actions` only. Treat the server as canonical.
4. Prefer, in order:
   - a move in `state.tactical.mates_in_one` or `immediate_wins`;
   - a move required by `state.tactical.mandatory_responses` or `mandatory_blocks`;
   - a forcing check, capture, or threat that limits the human's replies;
   - otherwise a positionally sound legal move derived from the full position and history.
5. Before submitting, run a one-ply safety check from the full position. For Chess and Xiangqi, inspect `state.move_details[<candidate>].opponent_threats`: `mates_in_one`, `checks`, structured `captures`, `moved_piece_captures`, `major_captures`, and `risk`. The compact `state.tactical.candidate_safety` lists candidates with immediate-loss or forcing-reply warnings. Reject a move that hangs the queen or another higher-value piece, removes the only defender of an attacked piece, or allows an immediate tactical loss without a concrete stronger continuation. Still verify long-range rook, bishop, cannon, and queen lines from the full position; the hint is one ply, not a substitute for analysis.
6. Submit exactly one action:

   ```bash
   node <skill-dir>/scripts/game-client.mjs act \
     --url <url> \
     --event <event-id> \
     --revision <revision> \
     --action '{"type":"move","value":"<encoded-move>"}'
   ```

   Encodings are Renju `H8`, Chess UCI `e2e4` or `e7e8q`, and Xiangqi UCCI `a0a1`. To resign, submit `{"type":"resign"}`.

7. On success, set the cursor to the processed `agent_turn` event's id—not the action response's optional `event_id`—and wait again. A terminal Agent action emits a following `game_over`, so always perform the next wait.
8. On HTTP 422, keep the same event and revision, choose another listed legal action, and retry. On HTTP 409, discard the stale action and wait after the last processed event id.

Compatibility commands remain available:

```bash
node <skill-dir>/scripts/game-client.mjs play --url <url> --event <id> --revision <rev> --move e2e4
node <skill-dir>/scripts/game-client.mjs play --url <url> --event <id> --revision <rev> --cell H8
```

## Keep play silent

After sharing the URL, emit no move announcements, analysis, routine status prose, or coordinate requests while the game is active. Use terminal operations until `game_over` or explicit cancellation. In hosts that require progress updates, do not use them for individual turns.

At game end, return only a short outcome such as `这局你赢了。`, `这局我赢了。`, or `这局和棋。`

## Trust the protocol boundary

The protocol is `human-agent-qipai/v1`. The server owns the unique full state, revision, roles, legal actions, history, and result. It separately creates `human`, `agent`, and `public` views; never infer private data that is absent from the Agent view.

Each event includes `session_id`, `event_id`, `revision`, `type`, and `state`. The state includes:

- `game`, `phase`, `active_actor`, `roles`, and `turn`
- `view`, canonical `position`, `history`, and `result`
- `legal_actions`, `legal_moves`, `move_details`, and `tactical`; Chess and Xiangqi candidate details include one-ply `opponent_threats`
- Renju-only `forbidden_moves`

The browser submits a human action to `POST /api/human-action`; the Agent CLI submits to `POST /api/agent-action`. Both use:

```json
{"expected_revision": 0, "action": {"type": "move", "value": "H8"}}
```

Agent requests additionally include `event_id`. These HTTP details are useful for protocol tests; during a real game, let the human use the page and use `game-client.mjs` for Agent actions.

Read a rule reference only to explain a disputed ruling or change its engine:

- [Strict Renju semantics](references/renju-rules.md)
- [Chess semantics](references/chess-rules.md)
- [Xiangqi semantics](references/xiangqi-rules.md)

## End the session

Stop the persistent server process after `game_over`, explicit cancellation, or task termination. Do not leave it running in the background.
