import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { createQipaiServer } from "../scripts/serve.mjs";

async function jsonRequest(url, path, options = {}) {
  const response = await fetch(new URL(path, url), {
    ...options,
    headers: {
      accept: "application/json",
      ...(options.body ? { "content-type": "application/json" } : {}),
    },
  });
  const payload = response.status === 204 ? null : await response.json();
  assert.equal(response.ok, true, payload?.error || `HTTP ${response.status}`);
  return payload;
}

test("the browser and Agent complete a live Chess round without chat", async (context) => {
  const runtime = createQipaiServer({ game: "chess", port: 0 });
  const started = await runtime.start();
  const browser = await chromium.launch({ headless: true });
  context.after(async () => {
    await browser.close();
    await runtime.close();
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(started.url, { waitUntil: "domcontentloaded" });
  await page.locator("#board .cell").first().waitFor();

  assert.equal(await page.locator("#board .cell").count(), 64);
  await page.locator('[data-cell="e2"]').click();
  await page.locator('[data-cell="e4"]').click();
  await page.locator('[data-cell="e4"][data-piece="wP"]').waitFor();
  await page.locator("#turn-heading", { hasText: "Agent 正在思考" }).waitFor();
  assert.equal(await page.locator("#board").getAttribute("class").then((value) => value.includes("locked")), true);

  const event = await jsonRequest(started.url, "/api/agent-events?after=0");
  assert.equal(event.type, "agent_turn");
  await jsonRequest(started.url, "/api/agent-action", {
    method: "POST",
    body: JSON.stringify({
      event_id: event.event_id,
      expected_revision: event.revision,
      action: { type: "move", value: "e7e5" },
    }),
  });

  await page.locator('[data-cell="e5"][data-piece="bP"]').waitFor();
  await page.locator("#turn-heading", { hasText: "轮到你" }).waitFor();
  assert.equal(await page.locator("#history li").count(), 2);
  assert.equal(await page.locator('[data-cell="g1"]').isEnabled(), true);
});

test("all registered renderers load their expected interactive board", async (context) => {
  const browser = await chromium.launch({ headless: true });
  const runtimes = [];
  context.after(async () => {
    await browser.close();
    await Promise.all(runtimes.map((runtime) => runtime.close()));
  });

  for (const [game, cellCount, firstCell] of [
    ["renju", 225, "H8"],
    ["chess", 64, "e2"],
    ["xiangqi", 90, "a3"],
  ]) {
    const runtime = createQipaiServer({ game, port: 0 });
    runtimes.push(runtime);
    const started = await runtime.start();
    const page = await browser.newPage();
    await page.goto(started.url, { waitUntil: "domcontentloaded" });
    await page.locator("#board .cell").first().waitFor();
    assert.equal(await page.locator("#board .cell").count(), cellCount);
    assert.equal(await page.locator(`[data-cell="${firstCell}"]`).isEnabled(), true);
    await page.close();
  }
});
