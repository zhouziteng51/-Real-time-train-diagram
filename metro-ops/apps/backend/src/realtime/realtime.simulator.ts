import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type { RealtimeVehicleState } from "@metro-ops/shared";
import {
  WS_EVENTS,
  globalNetworkRoom,
  routeRoom,
} from "@metro-ops/shared";
import { RealtimeGateway } from "./realtime.gateway.js";

@Injectable()
export class RealtimeSimulator implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeSimulator.name);
  private timer: NodeJS.Timeout | undefined;
  private readonly vehicles: RealtimeVehicleState[] = [
    {
      vehicleId: "V-204",
      trainNo: "G6001",
      routeId: "R-1042",
      tripId: "trip-demo-1",
      currentStationId: "玉泉河站",
      speedKph: 68,
      delaySeconds: 0,
      status: "RUNNING",
      updatedAt: new Date().toISOString(),
    },
    {
      vehicleId: "V-118",
      trainNo: "Z6001",
      routeId: "R-1045",
      tripId: "trip-demo-2",
      currentStationId: "奥体中心站",
      speedKph: 54,
      delaySeconds: 45,
      status: "RUNNING",
      updatedAt: new Date().toISOString(),
    },
    {
      vehicleId: "V-307",
      trainNo: "G6003",
      routeId: "R-1051",
      tripId: "trip-demo-3",
      currentStationId: "大湖站",
      speedKph: 0,
      delaySeconds: 180,
      status: "DWELLING",
      updatedAt: new Date().toISOString(),
    },
  ];

  constructor(@Inject(RealtimeGateway) private readonly gateway: RealtimeGateway) {}

  onModuleInit(): void {
    this.start();
  }

  onModuleDestroy(): void {
    this.stop();
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), 2000);
    this.logger.log("realtime simulator started");
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private tick(): void {
    const sentAt = new Date().toISOString();
    for (const v of this.vehicles) {
      v.speedKph = Math.max(0, (v.speedKph ?? 0) + (Math.random() * 10 - 5));
      v.updatedAt = sentAt;
    }
    const payload = {
      event: WS_EVENTS.VehicleUpdated,
      items: [...this.vehicles],
      sentAt,
    };
    this.gateway.broadcast(globalNetworkRoom(), payload);
    const byRoute = new Map<string, RealtimeVehicleState[]>();
    for (const v of this.vehicles) {
      const arr = byRoute.get(v.routeId) ?? [];
      arr.push(v);
      byRoute.set(v.routeId, arr);
    }
    for (const [routeId, items] of byRoute) {
      this.gateway.broadcast(routeRoom(routeId), {
        event: WS_EVENTS.VehicleUpdated,
        items,
        sentAt,
      });
    }
  }
}
