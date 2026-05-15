import { Global, Module } from "@nestjs/common";
import { RealtimeGateway } from "./realtime.gateway.js";
import { RealtimeSimulator } from "./realtime.simulator.js";

@Global()
@Module({
  providers: [RealtimeGateway, RealtimeSimulator],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
