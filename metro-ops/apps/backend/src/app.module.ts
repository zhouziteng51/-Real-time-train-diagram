import { Module } from "@nestjs/common";
import { TripModule } from "./trip/trip.module.js";
import { ImportModule } from "./import/import.module.js";
import { RealtimeModule } from "./realtime/realtime.module.js";
import { OperatorModule } from "./operator/operator.module.js";
import { RuntimeScheduleModule } from "./schedule/runtime-schedule.module.js";
import { IdempotencyInterceptor } from "./common/idempotency.interceptor.js";
import { APP_INTERCEPTOR } from "@nestjs/core";

@Module({
  imports: [OperatorModule, TripModule, ImportModule, RealtimeModule, RuntimeScheduleModule],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: IdempotencyInterceptor,
    },
  ],
})
export class AppModule {}
