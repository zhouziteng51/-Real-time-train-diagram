import assert from "node:assert/strict";
import { test } from "node:test";
import {
  IllegalTripTransition,
  nextTripStatus,
} from "../trip.js";
import { assertTransitionImport } from "../import.js";

test("trip state machine allows planned to active to arriving to archived", () => {
  assert.equal(nextTripStatus("PLANNED", "START"), "ACTIVE");
  assert.equal(
    nextTripStatus("ACTIVE", "ENTER_TERMINAL_APPROACH"),
    "ARRIVING_TERMINAL",
  );
  assert.equal(nextTripStatus("ARRIVING_TERMINAL", "ARCHIVE"), "ARCHIVED");
});

test("trip state machine rejects impossible archive from planned", () => {
  assert.throws(
    () => nextTripStatus("PLANNED", "ARCHIVE"),
    IllegalTripTransition,
  );
});

test("import state machine requires parsing before imported", () => {
  assert.throws(() => assertTransitionImport("UPLOADED", "IMPORTED"));
  assert.doesNotThrow(() => assertTransitionImport("NORMALIZED", "IMPORTED"));
});
