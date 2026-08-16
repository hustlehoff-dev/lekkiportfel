import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const applicationVariables = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
  "XAI_API_KEY",
  "XAI_MODEL",
];

test("environment example documents every application variable without real credentials", async () => {
  const example = await readFile(new URL(".env.example", root), "utf8");
  const documentation = await readFile(new URL("docs/environment.md", root), "utf8");
  const assignments = new Map(
    example
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => line.split(/=(.*)/s).slice(0, 2)),
  );

  assert.deepEqual([...assignments.keys()], applicationVariables);
  assert.equal(assignments.get("XAI_MODEL"), "grok-4.3");
  for (const name of applicationVariables) assert.match(documentation, new RegExp(`\\b${name}\\b`));
  assert.doesNotMatch(example, /AIza[0-9A-Za-z_-]{20,}/);
  assert.doesNotMatch(example, /xai-[0-9A-Za-z_-]{10,}/);
  assert.doesNotMatch(example, /LEGACY_MIGRATION_KEY/);
});
