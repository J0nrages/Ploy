import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { SPIKE_MOVE, wrapInstance } from "@ploy/rules";

test("spike worker source uses the required module Worker constructor form", () => {
  const source = readFileSync(new URL("./worker.ts", import.meta.url), "utf8");
  expect(source.includes("new URL(")).toBe(true);
  const importer = readFileSync(new URL("./runWorker.ts", import.meta.url), "utf8");
  expect(importer).toContain('new Worker(new URL("./worker.ts", import.meta.url), { type: "module" })');
});

test("module Worker applies the spike fixture", async () => {
  const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  const json = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("worker timeout")), 10_000);
    worker.onmessage = (event: MessageEvent<{ type: string; json?: string }>) => {
      if (event.data.type === "ready") {
        worker.postMessage({ type: "apply-fixture" });
        return;
      }
      if (event.data.type === "fixture" && event.data.json) {
        clearTimeout(timer);
        resolve(event.data.json);
      }
    };
    worker.onerror = (error) => {
      clearTimeout(timer);
      reject(error);
    };
  });
  worker.terminate();

  const bytes = readFileSync(new URL("../../../../packages/rules/wasm/ploy_core.wasm", import.meta.url));
  const { instance } = await WebAssembly.instantiate(bytes, {});
  const api = wrapInstance(instance);
  const expected = api.applyMoveRaw(api.createGame("twoPlayer"), SPIKE_MOVE, "green");
  expect(json).toBe(expected);
});
