import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { SPIKE_MOVE, wrapInstance } from "../packages/rules/src/index.ts";

function run(command: string, args: string[], env: NodeJS.ProcessEnv = {}): string {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed:\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout;
}

const rulesPath = "packages/rules/wasm/ploy_core.wasm";

run("bun", ["run", "build:wasm"]);

const rulesBytes = readFileSync(rulesPath);
const rulesHash = createHash("sha256").update(rulesBytes).digest("hex");

const module = await WebAssembly.compile(rulesBytes);
if (WebAssembly.Module.imports(module).length !== 0) {
  throw new Error("WASM module imports are not empty");
}

const instantiated = await WebAssembly.instantiate(module, {});
const instance =
  instantiated instanceof WebAssembly.Instance ? instantiated : instantiated.instance;
const api = wrapInstance(instance);
const fixtureJson = api.applyMoveRaw(api.createGame("twoPlayer"), SPIKE_MOVE, "green");

const started = performance.now();
const search = api.chooseMove({
  snapshot: api.createGame("twoPlayer"),
  color: "green",
  maxDepth: 3,
  maxNodes: 50_000,
  randomSeed: 1,
});
const elapsedMs = Math.max(performance.now() - started, 0.001);
const nodesPerSecond = Math.round((search.nodes / elapsedMs) * 1000);

const notes = `# WASM spike

- artifact SHA-256: \`${rulesHash}\`
- imports: none
- fixture apply JSON bytes: ${fixtureJson.length}
- Tensi-style search completed depth ${search.depth}: ${search.nodes} nodes in ${elapsedMs.toFixed(2)} ms
- nodes/second: ${nodesPerSecond}

The browser Worker applies the Green e3-e4 shield motion and must return this exact JSON payload:

\`\`\`json
${fixtureJson}
\`\`\`
`;
writeFileSync("docs/wasm-spike.md", notes);

console.log(notes);
console.log("wasm-gate local checks passed");
