import { Module } from "@nestjs/common";
import { TripModule } from "./trip/trip.module.js";
import { ImportModule } from "./import/import.module.js";
import { RealtimeModule } from "./realtime/realtime.module.js";
import { OperatorModule } from "./operator/operator.module.js";
import { RuntimeScheduleModule } from "./schedule/runtime-schedule.module.js";
import { IdempotencyInterceptor } from "./common/idempotency.interceptor.js";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { AuthModule } from "./auth/auth.module.js";
import { PersistenceModule } from "./persistence/persistence.module.js";
import { StorageModule } from "./storage/storage.module.js";
import { ObservabilityModule } from "./observability/observability.module.js";

@Module({
  imports: [
    AuthModule,
    PersistenceModule,
    StorageModule,
    OperatorModule,
    TripModule,
    ImportModule,
    RealtimeModule,
    RuntimeScheduleModule,
    ObservabilityModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: IdempotencyInterceptor,
    },
  ],
})
export class AppModule {}
