import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { ROLES_KEY } from "../../auth/roles.decorator.js";
import { TripController } from "../trip.module.js";

test("driver trip mutation endpoints are executable by drivers", () => {
  assert.deepEqual(roleMetadata("start"), ["DRIVER"]);
  assert.deepEqual(roleMetadata("arrive"), ["DRIVER"]);
  assert.deepEqual(roleMetadata("archive"), ["DRIVER"]);
});

function roleMetadata(method: "start" | "arrive" | "archive") {
  return Reflect.getMetadata(ROLES_KEY, TripController.prototype[method]);
}
