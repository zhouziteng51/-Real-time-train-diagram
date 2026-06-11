import "reflect-metadata";
import { loadEnvFiles } from "./config/load-env.js";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { RealtimeGateway } from "./realtime/realtime.gateway.js";

loadEnvFiles();

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  const realtime = app.get(RealtimeGateway);
  realtime.attachHttpServer(app.getHttpServer());
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`[metro-ops] backend listening on :${port}`);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
