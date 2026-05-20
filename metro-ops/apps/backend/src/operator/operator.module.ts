import { Controller, Get, Module } from "@nestjs/common";
import type { OperatorContext } from "@metro-ops/shared";
import { DEMO_OPERATORS } from "./operator.fixtures.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthenticatedUser } from "../auth/roles.js";

@Controller("api/operators")
export class OperatorController {
  @Get()
  list(): OperatorContext[] {
    return DEMO_OPERATORS;
  }

  @Get("me")
  me(@CurrentUser() user: AuthenticatedUser): OperatorContext {
    return (
      DEMO_OPERATORS.find((operator) => operator.operatorId === user.id) ??
      DEMO_OPERATORS[0]!
    );
  }
}

@Module({ controllers: [OperatorController] })
export class OperatorModule {}
