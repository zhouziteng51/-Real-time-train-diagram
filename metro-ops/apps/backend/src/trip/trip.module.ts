import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Module,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import {
  ArchiveTripBodySchema,
  ArriveTerminalBodySchema,
  HistoryTripQuerySchema,
  IllegalTripTransition,
  StartTripBodySchema,
  WS_EVENTS,
  tripRoom,
} from "@metro-ops/shared";
import type { TripEvent, TripTask } from "@metro-ops/shared";
import { TripStore } from "./trip.store.js";
import { RealtimeGateway } from "../realtime/realtime.gateway.js";
import { RealtimeModule } from "../realtime/realtime.module.js";
import { Roles } from "../auth/roles.decorator.js";

@Controller("api/trips")
export class TripController {
  constructor(
    @Inject(TripStore) private readonly store: TripStore,
    @Inject(RealtimeGateway) private readonly realtime: RealtimeGateway,
  ) {}

  @Get("active")
  active(): TripTask[] {
    return this.store.active();
  }

  @Get("history")
  @Roles("DISPATCHER")
  history(@Query() query: unknown): TripTask[] {
    const parsed = HistoryTripQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const {
      tripId,
      trainNo,
      routeId,
      scheduleVersionId,
      operatorName,
      date,
      limit,
    } = parsed.data;
    return this.store
      .queryHistory({
        ...(tripId ? { tripId } : {}),
        ...(trainNo ? { trainNo } : {}),
        ...(routeId ? { routeId } : {}),
        ...(scheduleVersionId ? { scheduleVersionId } : {}),
        ...(operatorName ? { operatorName } : {}),
        ...(date ? { date } : {}),
      })
      .slice(0, limit);
  }

  @Get(":tripId")
  detail(@Param("tripId") tripId: string): {
    trip: TripTask;
    events: TripEvent[];
  } {
    const trip = this.store.mustFind(tripId);
    return { trip, events: this.store.historyEvents(tripId) };
  }

  @Post(":tripId/start")
  @HttpCode(200)
  start(@Param("tripId") tripId: string, @Body() body: unknown) {
    const parsed = StartTripBodySchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.transitionAndBroadcast({
      tripId,
      event: "START",
      source: "OPERATOR",
      ...(parsed.data.actualDepartureAt
        ? { occurredAt: parsed.data.actualDepartureAt }
        : {}),
    });
  }

  @Post(":tripId/arrive-terminal")
  @HttpCode(200)
  arrive(@Param("tripId") tripId: string, @Body() body: unknown) {
    const parsed = ArriveTerminalBodySchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.transitionAndBroadcast({
      tripId,
      event: "ARRIVE_TERMINAL",
      source: parsed.data.source,
      ...(parsed.data.occurredAt ? { occurredAt: parsed.data.occurredAt } : {}),
    });
  }

  @Post(":tripId/archive")
  @Roles("DISPATCHER")
  @HttpCode(200)
  archive(@Param("tripId") tripId: string, @Body() body: unknown) {
    const parsed = ArchiveTripBodySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.transitionAndBroadcast({
      tripId,
      event: "ARCHIVE",
      source: "OPERATOR",
      occurredAt: parsed.data.actualArrivalAt,
    });
  }

  private transitionAndBroadcast(
    input: Parameters<TripStore["transition"]>[0],
  ) {
    try {
      const { trip, event } = this.store.transition(input);
      this.realtime.broadcast(tripRoom(trip.id), {
        event: WS_EVENTS.TripStatusChanged,
        tripId: trip.id,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        occurredAt: event.occurredAt,
      });
      return { trip, event };
    } catch (err) {
      if (err instanceof IllegalTripTransition) {
        throw new BadRequestException({
          code: "ILLEGAL_TRANSITION",
          message: err.message,
        });
      }
      throw err;
    }
  }
}

@Module({
  imports: [RealtimeModule],
  controllers: [TripController],
  providers: [TripStore],
  exports: [TripStore],
})
export class TripModule {}
