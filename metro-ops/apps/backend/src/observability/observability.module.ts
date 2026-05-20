import { Controller, Get, Inject, Module } from "@nestjs/common";
import { RealtimeGateway } from "../realtime/realtime.gateway.js";
import { RealtimeModule } from "../realtime/realtime.module.js";
import { PostgresService } from "../persistence/postgres.service.js";

@Controller("api/ops")
export class ObservabilityController {
  constructor(
    @Inject(RealtimeGateway) private readonly realtime: RealtimeGateway,
    @Inject(PostgresService) private readonly postgres: PostgresService,
  ) {}

  @Get("health")
  health(): {
    status: "ok";
    postgres: "enabled" | "disabled";
    websocket: ReturnType<RealtimeGateway["stats"]>;
  } {
    return {
      status: "ok",
      postgres: this.postgres.isEnabled() ? "enabled" : "disabled",
      websocket: this.realtime.stats(),
    };
  }
}

@Module({
  imports: [RealtimeModule],
  controllers: [ObservabilityController],
})
export class ObservabilityModule {}
