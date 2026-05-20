import assert from "node:assert/strict";
import { test } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RoleGuard } from "../auth.guard.js";
import { ROLES_KEY } from "../roles.decorator.js";
import type { AuthenticatedUser, UserRole } from "../roles.js";

test("role guard allows endpoints without role metadata", () => {
  const guard = new RoleGuard(reflectorFor());
  const request = requestFor({});

  assert.equal(guard.canActivate(contextFor(request)), true);
  assert.equal(request.user?.role, "DRIVER");
});

test("role guard rejects users below required role", () => {
  const guard = new RoleGuard(reflectorFor(["ADMIN"]));
  const request = requestFor({ "x-user-role": "DISPATCHER" });

  assert.throws(() => guard.canActivate(contextFor(request)), ForbiddenException);
});

function reflectorFor(required: UserRole[] = []): Reflector {
  return {
    getAllAndOverride: (key: string) => (key === ROLES_KEY ? required : []),
  } as unknown as Reflector;
}

function requestFor(headers: Record<string, string>): {
  headers: Record<string, string>;
  user?: AuthenticatedUser;
} {
  return { headers };
}

function contextFor(request: { headers: Record<string, string> }) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as never;
}
