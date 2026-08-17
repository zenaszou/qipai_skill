#!/usr/bin/env node

import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createQipaiServer } from "../qipai/scripts/serve.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "docs", "qipai-chess.png");

async function clickMove(page, move) {
  await page.locator(`[data-cell="${move.slice(0, 2)}"]`).click();
  await page.locator(`[data-cell="${move.slice(2, 4)}"]`).click();
}

async function agentMove(url, after, move) {
  const eventResponse = await fetch(new URL(`/api/agent-events?after=${after}`, url));
  const event = await eventResponse.json();
  const actionResponse = await fetch(new URL("/api/agent-action", url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      event_id: event.event_id,
      expected_revision: event.revision,
      action: { type: "move", value: move },
    }),
  });
  if (!actionResponse.ok) throw new Error((await actionResponse.json()).error);
  return event.event_id;
}

const runtime = createQipaiServer({ game: "chess", port: 0 });
const started = await runtime.start();
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });
  await page.goto(started.url, { waitUntil: "domcontentloaded" });
  await page.locator("#board .cell").first().waitFor();
  let eventId = 0;
  await clickMove(page, "e2e4");
  eventId = await agentMove(started.url, eventId, "e7e5");
  await page.locator('[data-cell="e5"][data-piece="bP"]').waitFor();
  await clickMove(page, "g1f3");
  eventId = await agentMove(started.url, eventId, "b8c6");
  await page.locator('[data-cell="c6"][data-piece="bN"]').waitFor();
  await clickMove(page, "f1c4");
  await agentMove(started.url, eventId, "g8f6");
  await page.locator('[data-cell="f6"][data-piece="bN"]').waitFor();
  await mkdir(dirname(output), { recursive: true });
  await page.screenshot({ path: output, fullPage: true });
  process.stdout.write(`${output}\n`);
} finally {
  await browser.close();
  await runtime.close();
}
