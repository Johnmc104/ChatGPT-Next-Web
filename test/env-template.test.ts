/**
 * @jest-environment node
 *
 * Keeps .env.template in sync with the variables the server reads.
 */
import { readFileSync } from "fs";
import { join } from "path";

const root = join(__dirname, "..");
// Platform / build variables that deployers do not set themselves.
const PLATFORM_VARS = new Set([
  "NODE_ENV",
  "NEXT_PHASE",
  "VERCEL",
  "BUILD_MODE",
]);

function readVars() {
  // Runtime config (server.ts) and build-time config (build.ts).
  const source = ["app/config/server.ts", "app/config/build.ts"]
    .map((file) => readFileSync(join(root, file), "utf8"))
    .join("\n");
  return new Set(
    [...source.matchAll(/process\.env\.([A-Z0-9_]+)/g)]
      .map((m) => m[1])
      .filter((name) => !PLATFORM_VARS.has(name)),
  );
}

function templateVars() {
  const template = readFileSync(join(root, ".env.template"), "utf8");
  return new Set([...template.matchAll(/^([A-Z0-9_]+)=/gm)].map((m) => m[1]));
}

test("every server environment variable is documented in .env.template", () => {
  const documented = templateVars();
  const missing = [...readVars()].filter((name) => !documented.has(name));
  expect(missing).toEqual([]);
});

test(".env.template lists no variable the server ignores", () => {
  const used = readVars();
  const stale = [...templateVars()].filter((name) => !used.has(name));
  expect(stale).toEqual([]);
});

test(".env.template carries no filled-in values", () => {
  const template = readFileSync(join(root, ".env.template"), "utf8");
  const filled = template
    .split("\n")
    .filter((line) => /^[A-Z0-9_]+=.+/.test(line));
  expect(filled).toEqual([]);
});
