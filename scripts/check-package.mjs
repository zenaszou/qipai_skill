#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skillDir = join(root, "qipai");
const required = [
  "SKILL.md",
  "agents/openai.yaml",
  "assets/app/index.html",
  "assets/app/app.js",
  "assets/app/styles.css",
  "scripts/serve.mjs",
  "scripts/game-client.mjs",
  "scripts/game-registry.mjs",
];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else files.push(path);
  }
  return files;
}

for (const path of required) {
  await readFile(join(skillDir, path));
}

const skill = await readFile(join(skillDir, "SKILL.md"), "utf8");
const match = skill.match(/^---\n([\s\S]*?)\n---\n/);
if (!match) throw new Error("qipai/SKILL.md must start with YAML frontmatter");

const keys = [...match[1].matchAll(/^([a-zA-Z0-9_-]+):/gm)].map((item) => item[1]);
if (!keys.includes("name") || !keys.includes("description")) {
  throw new Error("SKILL.md frontmatter must include name and description");
}
if (keys.some((key) => !["name", "description"].includes(key))) {
  throw new Error(`Unsupported SKILL.md frontmatter key: ${keys.find((key) => !["name", "description"].includes(key))}`);
}
if (!/^name:\s*qipai\s*$/m.test(match[1])) {
  throw new Error("SKILL.md name must be qipai");
}

const unwanted = (await walk(root))
  .map((path) => relative(root, path))
  .filter((path) => path.split("/").includes(".DS_Store"));
if (unwanted.length) throw new Error(`Remove system files: ${unwanted.join(", ")}`);

console.log("Qipai package structure is valid.");
