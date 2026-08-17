import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

const targetDir = process.env.CARGO_TARGET_DIR ?? "target";
const source = `${targetDir}/wasm32-unknown-unknown/release/ploy_wasm.wasm`;
const destinations = ["packages/rules/wasm/ploy_core.wasm", "convex/generated/ploy_core.wasm"];

const bytes = readFileSync(source);
const hash = createHash("sha256").update(bytes).digest("hex");

for (const destination of destinations) {
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
}

console.log(`copied wasm sha256=${hash}`);
