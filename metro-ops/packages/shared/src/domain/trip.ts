import { z } from "zod";
import { DirectionSchema, IsoDateTimeSchema } from "./common.js";

export const TripStatusSchema = z.enum([
  "PLANNED",
  "ACTIVE",
  "ARRIVING_TERMINAL",
  "ARCHIVED",
  "CANCELLED",
]);
export type TripStatus = z.infer<typeof TripStatusSchema>;

export const TripEventKindSchema = z.enum([
  "START",
  "DEPART_ORIGIN",
  "ENTER_TERMINAL_APPROACH",
  "ARRIVE_TERMINAL",
  "ARCHIVE",
  "CANCEL",
]);
export type TripEventKind = z.infer<typeof TripEventKindSchema>;

export const TripEventSourceSchema = z.enum(["REALTIME", "OPERATOR", "SYSTEM"]);
export type TripEventSource = z.infer<typeof TripEventSourceSchema>;

export const TripTaskSchema = z.object({
  id: z.string(),
  trainNo: z.string(),
  routeId: z.string(),
  direction: DirectionSchema,
  originStationId: z.string(),
  terminalStationId: z.string(),
  scheduleVersionId: z.string(),
  plannedDepartureAt: IsoDateTimeSchema,
  plannedArrivalAt: IsoDateTimeSchema,
  actualDepartureAt: IsoDateTimeSchema.optional(),
  actualArrivalAt: IsoDateTimeSchema.optional(),
  assignedOperatorIds: z.array(z.string()),
  assignedVehicleId: z.string().optional(),
  status: TripStatusSchema,
});
export type TripTask = z.infer<typeof TripTaskSchema>;

export const CurrentDutyContextSchema = z.object({
  tripId: z.string(),
  trainNo: z.string(),
  direction: DirectionSchema,
  terminalStationId: z.string(),
  terminalStationName: z.string(),
  scheduleVersionId: z.string(),
  routeId: z.string(),
  vehicleId: z.string().optional(),
  status: TripStatusSchema,
});
export type CurrentDutyContext = z.infer<typeof CurrentDutyContextSchema>;

export const TripEventSchema = z.object({
  id: z.string(),
  tripId: z.string(),
  kind: TripEventKindSchema,
  fromStatus: TripStatusSchema,
  toStatus: TripStatusSchema,
  source: TripEventSourceSchema,
  actorOperatorId: z.string().optional(),
  occurredAt: IsoDateTimeSchema,
  payload: z.record(z.unknown()).optional(),
});
export type TripEvent = z.infer<typeof TripEventSchema>;
