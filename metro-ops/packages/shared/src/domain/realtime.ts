import { z } from "zod";
import { IsoDateTimeSchema } from "./common.js";

export const RealtimeVehicleStatusSchema = z.enum([
  "RUNNING",
  "DWELLING",
  "STOPPED",
  "HELD",
  "OFFLINE",
  "ARRIVED",
]);
export type RealtimeVehicleStatus = z.infer<typeof RealtimeVehicleStatusSchema>;

export const RealtimeVehicleStateSchema = z.object({
  vehicleId: z.string(),
  trainNo: z.string(),
  routeId: z.string(),
  tripId: z.string().optional(),
  currentStationId: z.string().optional(),
  currentSegmentId: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  speedKph: z.number().nonnegative().optional(),
  delaySeconds: z.number().int().optional(),
  status: RealtimeVehicleStatusSchema,
  updatedAt: IsoDateTimeSchema,
});
export type RealtimeVehicleState = z.infer<typeof RealtimeVehicleStateSchema>;
