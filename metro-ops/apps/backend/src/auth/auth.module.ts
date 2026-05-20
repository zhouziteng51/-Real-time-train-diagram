import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { RoleGuard } from "./auth.guard.js";

@Global()
@Module({
  providers: [
    {
      provide: APP_GUARD,
      useClass: RoleGuard,
    },
  ],
})
export class AuthModule {}
