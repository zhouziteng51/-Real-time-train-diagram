import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_WS_PORT, resolveWsPort } from "../realtime.config.js";

test("resolveWsPort falls back to the default port", () => {
  assert.equal(resolveWsPort(""), DEFAULT_WS_PORT);
  assert.equal(resolveWsPort("abc"), DEFAULT_WS_PORT);
  assert.equal(resolveWsPort("-1"), DEFAULT_WS_PORT);
});

test("resolveWsPort accepts an explicit positive port", () => {
  assert.equal(resolveWsPort("3009"), 3009);
});
