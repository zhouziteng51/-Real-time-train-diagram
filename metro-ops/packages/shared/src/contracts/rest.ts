import { z } from "zod";
import { IsoDateSchema } from "../domain/common.js";

export const HistoryTripQuerySchema = z.object({
  operatorName: z.string().optional(),
  trainNo: z.string().optional(),
  scheduleVersionId: z.string().optional(),
  date: IsoDateSchema.optional(),
  routeId: z.string().optional(),
  tripId: z.string().optional(),
  limit: z.coerce.number().int().positive().max(200).default(50),
  cursor: z.string().optional(),
});
export type HistoryTripQuery = z.infer<typeof HistoryTripQuerySchema>;

export const StartTripBodySchema = z.object({
  actualDepartureAt: z.string().datetime({ offset: true }).optional(),
});
export type StartTripBody = z.infer<typeof StartTripBodySchema>;

export const ArriveTerminalBodySchema = z.object({
  source: z.enum(["REALTIME", "OPERATOR"]).default("OPERATOR"),
  occurredAt: z.string().datetime({ offset: true }).optional(),
});
export type ArriveTerminalBody = z.infer<typeof ArriveTerminalBodySchema>;

export const ArchiveTripBodySchema = z.object({
  actualArrivalAt: z.string().datetime({ offset: true }),
});
export type ArchiveTripBody = z.infer<typeof ArchiveTripBodySchema>;

export const ConfirmImportBodySchema = z.object({
  acceptedSections: z
    .object({
      trains: z.boolean().default(true),
      segments: z.boolean().default(true),
      duties: z.boolean().default(true),
    })
    .default({ trains: true, segments: true, duties: true }),
  targetScheduleVersionName: z.string().optional(),
  dutyDate: IsoDateSchema.optional(),
});
export type ConfirmImportBody = z.infer<typeof ConfirmImportBodySchema>;

export const IDEMPOTENCY_HEADER = "idempotency-key";
