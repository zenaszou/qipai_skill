#!/usr/bin/env node

function parseArguments(argv) {
  const command = argv[0];
  const values = {};
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
    const key = argument.slice(2).replaceAll("-", "_");
    const value = argv[++index];
    if (value === undefined) throw new Error(`${argument} requires a value`);
    values[key] = value;
  }
  return { command, values };
}

function baseUrl(value) {
  return (value || "http://127.0.0.1:4173").replace(/\/+$/, "");
}

async function responseJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Server returned non-JSON data: ${text.slice(0, 160)}`);
  }
}

async function waitForEvent(values) {
  const after = Number(values.after || 0);
  if (!Number.isInteger(after) || after < 0) {
    throw new Error("--after must be a non-negative event id");
  }
  for (;;) {
    const response = await fetch(
      `${baseUrl(values.url)}/api/agent-events?after=${encodeURIComponent(after)}`,
      { headers: { accept: "application/json" } },
    );
    if (response.status === 204) continue;
    const payload = await responseJson(response);
    if (!response.ok) {
      throw new Error(payload?.error || `Wait failed with HTTP ${response.status}`);
    }
    process.stdout.write(`${JSON.stringify(payload)}\n`);
    return;
  }
}

function commonActionArguments(values) {
  const eventId = Number(values.event);
  const revision = Number(values.revision);
  if (!Number.isInteger(eventId) || eventId < 1) {
    throw new Error("--event must be a positive event id");
  }
  if (!Number.isInteger(revision) || revision < 0) {
    throw new Error("--revision must be a non-negative revision");
  }
  return { eventId, revision };
}

async function submitAction(values, action) {
  const { eventId, revision } = commonActionArguments(values);
  const response = await fetch(`${baseUrl(values.url)}/api/agent-action`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      event_id: eventId,
      expected_revision: revision,
      action,
    }),
  });
  const payload = await responseJson(response);
  process.stdout.write(`${JSON.stringify(payload)}\n`);
  if (!response.ok) process.exitCode = 1;
}

async function act(values) {
  if (!values.action) throw new Error("--action requires a JSON object");
  let action;
  try {
    action = JSON.parse(values.action);
  } catch {
    throw new Error("--action must be valid JSON");
  }
  if (!action || typeof action !== "object" || typeof action.type !== "string") {
    throw new Error("--action must contain a type");
  }
  await submitAction(values, action);
}

async function play(values) {
  const value = String(values.move || values.cell || "").trim();
  if (!value) throw new Error("play requires --move or --cell");
  await submitAction(values, { type: "move", value });
}

function help() {
  process.stdout.write(
    [
      "Usage:",
      "  node scripts/game-client.mjs wait --url <url> --after <event-id>",
      "  node scripts/game-client.mjs act --url <url> --event <id> --revision <rev> --action '<json>'",
      "  node scripts/game-client.mjs play --url <url> --event <id> --revision <rev> --move <notation>",
      "  node scripts/game-client.mjs resign --url <url> --event <id> --revision <rev>",
      "",
    ].join("\n"),
  );
}

async function main() {
  const { command, values } = parseArguments(process.argv.slice(2));
  if (command === "wait") await waitForEvent(values);
  else if (command === "act") await act(values);
  else if (command === "play") await play(values);
  else if (command === "resign") await submitAction(values, { type: "resign" });
  else if (!command || command === "help" || command === "--help") help();
  else throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});
