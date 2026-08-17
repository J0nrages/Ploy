import { expect, test } from "bun:test";
import { App } from "./App";
import { getSessionId, newRequestId } from "./session";

test("App is a function component", () => {
  expect(typeof App).toBe("function");
});

test("session helpers create unguessable ids", () => {
  expect(getSessionId().length).toBeGreaterThan(8);
  expect(newRequestId()).not.toBe(newRequestId());
});
