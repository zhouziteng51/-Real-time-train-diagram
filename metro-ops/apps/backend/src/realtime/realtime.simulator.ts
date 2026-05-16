import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import type {
  RealtimeVehicleState,
  RealtimeVehicleStatus,
  TripTask,
} from "@metro-ops/shared";
import {
  WS_EVENTS,
  globalNetworkRoom,
  routeRoom,
} from "@metro-ops/shared";
import { TripStore } from "../trip/trip.store.js";
import { RealtimeGateway } from "./realtime.gateway.js";

@Injectable()
export class RealtimeSimulator implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeSimulator.name);
  private timer: NodeJS.Timeout | undefined;
  private tripStore: TripStore | undefined;
  private tripStoreLookupWarned = false;
  private previousVehiclesById = new Map<string, RealtimeVehicleState>();

  constructor(
    @Inject(RealtimeGateway) private readonly gateway: RealtimeGateway,
    private readonly moduleRef: ModuleRef,
  ) {}

  onModuleInit(): void {
    this.start();
  }

  onModuleDestroy(): void {
    this.stop();
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), 2000);
    this.tick();
    this.logger.log("realtime simulator started");
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private tick(): void {
    const sentAt = new Date().toISOString();
    const vehicles = this.buildVehicleSnapshot(sentAt).map((vehicle) =>
      this.advanceVehicle(vehicle, sentAt),
    );
    this.previousVehiclesById = new Map(
      vehicles.map((vehicle) => [vehicle.vehicleId, vehicle]),
    );

    const payload = {
      event: WS_EVENTS.VehicleUpdated,
      items: vehicles,
      sentAt,
    };
    this.gateway.broadcast(globalNetworkRoom(), payload);
    const byRoute = new Map<string, RealtimeVehicleState[]>();
    for (const v of vehicles) {
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

  private buildVehicleSnapshot(sentAt: string): RealtimeVehicleState[] {
    const tripStore = this.resolveTripStore();
    if (!tripStore) return [];

    return tripStore
      .active()
      .map((trip, index) => realtimeVehicleFromTrip(trip, sentAt, index));
  }

  private resolveTripStore(): TripStore | undefined {
    if (this.tripStore) return this.tripStore;

    try {
      this.tripStore = this.moduleRef.get(TripStore, { strict: false });
    } catch {
      if (!this.tripStoreLookupWarned) {
        this.logger.warn("TripStore is not available for realtime vehicles");
        this.tripStoreLookupWarned = true;
      }
    }

    return this.tripStore;
  }

  private advanceVehicle(
    vehicle: RealtimeVehicleState,
    sentAt: string,
  ): RealtimeVehicleState {
    const previous = this.previousVehiclesById.get(vehicle.vehicleId);
    const speedKph =
      vehicle.status === "RUNNING"
        ? Math.max(
            0,
            (previous?.speedKph ?? vehicle.speedKph ?? 0) +
              (Math.random() * 10 - 5),
          )
        : 0;

    return {
      ...vehicle,
      speedKph,
      updatedAt: sentAt,
    };
  }
}

function realtimeVehicleFromTrip(
  trip: TripTask,
  sentAt: string,
  index: number,
): RealtimeVehicleState {
  const status = realtimeStatusForTrip(trip, new Date(sentAt));
  const currentStationId = currentStationForTrip(trip, status);

  return {
    vehicleId: trip.assignedVehicleId ?? `vehicle-${trip.id}`,
    trainNo: trip.trainNo,
    routeId: trip.routeId,
    tripId: trip.id,
    ...(currentStationId ? { currentStationId } : {}),
    speedKph: baseSpeedKph(status, index),
    delaySeconds: delaySecondsForTrip(trip),
    status,
    updatedAt: sentAt,
  };
}

function realtimeStatusForTrip(
  trip: TripTask,
  now: Date,
): RealtimeVehicleStatus {
  if (trip.status === "ACTIVE") return "RUNNING";
  if (trip.status === "ARRIVING_TERMINAL") return "DWELLING";
  if (trip.status === "ARCHIVED") return "ARRIVED";
  if (trip.status === "CANCELLED") return "OFFLINE";

  const departureMs = Date.parse(trip.actualDepartureAt ?? trip.plannedDepartureAt);
  const arrivalMs = Date.parse(trip.actualArrivalAt ?? trip.plannedArrivalAt);
  if (!Number.isFinite(departureMs) || !Number.isFinite(arrivalMs)) {
    return "STOPPED";
  }

  const nowMs = now.getTime();
  if (nowMs > arrivalMs) return "ARRIVED";
  if (nowMs >= departureMs) return "RUNNING";
  return "STOPPED";
}

function currentStationForTrip(
  trip: TripTask,
  status: RealtimeVehicleStatus,
): string | undefined {
  if (status === "ARRIVED" || trip.status === "ARRIVING_TERMINAL") {
    return trip.terminalStationId;
  }
  return status === "RUNNING" ? trip.originStationId : undefined;
}

function baseSpeedKph(status: RealtimeVehicleStatus, index: number): number {
  return status === "RUNNING" ? 52 + ((index * 7) % 24) : 0;
}

function delaySecondsForTrip(trip: TripTask): number {
  if (!trip.actualDepartureAt) return 0;

  const plannedMs = Date.parse(trip.plannedDepartureAt);
  const actualMs = Date.parse(trip.actualDepartureAt);
  if (!Number.isFinite(plannedMs) || !Number.isFinite(actualMs)) return 0;
  return Math.max(0, Math.round((actualMs - plannedMs) / 1000));
}
