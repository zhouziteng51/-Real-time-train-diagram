import { z } from "zod";
import { ImportJobSchema } from "../domain/import.js";
import { RealtimeVehicleStateSchema } from "../domain/realtime.js";
import { TripStatusSchema } from "../domain/trip.js";
import { IsoDateTimeSchema } from "../domain/common.js";

export const WS_EVENTS = {
  VehicleUpdated: "network.vehicle.updated",
  TripStatusChanged: "trip.status.changed",
  TripArrivedTerminal: "trip.arrived.terminal",
  ImportJobUpdated: "import.job.updated",
  ScheduleVersionActivated: "schedule.version.activated",
} as const;

export type WsEventName = (typeof WS_EVENTS)[keyof typeof WS_EVENTS];

export const WsSubscribeMessageSchema = z.object({
  type: z.literal("subscribe"),
  rooms: z.array(z.string()).min(1),
});
export const WsUnsubscribeMessageSchema = z.object({
  type: z.literal("unsubscribe"),
  rooms: z.array(z.string()).min(1),
});
export const WsClientMessageSchema = z.discriminatedUnion("type", [
  WsSubscribeMessageSchema,
  WsUnsubscribeMessageSchema,
]);
export type WsClientMessage = z.infer<typeof WsClientMessageSchema>;

export const VehicleUpdatedPayloadSchema = z.object({
  event: z.literal(WS_EVENTS.VehicleUpdated),
  items: z.array(RealtimeVehicleStateSchema),
  sentAt: IsoDateTimeSchema,
});
export const TripStatusChangedPayloadSchema = z.object({
  event: z.literal(WS_EVENTS.TripStatusChanged),
  tripId: z.string(),
  fromStatus: TripStatusSchema,
  toStatus: TripStatusSchema,
  occurredAt: IsoDateTimeSchema,
});
export const ImportJobUpdatedPayloadSchema = z.object({
  event: z.literal(WS_EVENTS.ImportJobUpdated),
  job: ImportJobSchema,
});

export const WsServerMessageSchema = z.discriminatedUnion("event", [
  VehicleUpdatedPayloadSchema,
  TripStatusChangedPayloadSchema,
  ImportJobUpdatedPayloadSchema,
]);
export type WsServerMessage = z.infer<typeof WsServerMessageSchema>;

export function globalNetworkRoom(): string {
  return "network:global";
}
export function routeRoom(routeId: string): string {
  return `route:${routeId}`;
}
export function tripRoom(tripId: string): string {
  return `trip:${tripId}`;
}
export function importJobRoom(jobId: string): string {
  return `import:${jobId}`;
}
