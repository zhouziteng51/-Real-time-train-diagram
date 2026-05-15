import { Controller, Get, Module } from "@nestjs/common";
import type { OperatorContext } from "@metro-ops/shared";
import { DEMO_OPERATORS } from "./operator.fixtures.js";

@Controller("api/operators")
export class OperatorController {
  @Get()
  list(): OperatorContext[] {
    return DEMO_OPERATORS;
  }

  @Get("me")
  me(): OperatorContext {
    return DEMO_OPERATORS[0]!;
  }
}

@Module({ controllers: [OperatorController] })
export class OperatorModule {}
