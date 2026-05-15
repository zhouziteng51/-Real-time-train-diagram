import { z } from "zod";
import { IsoDateSchema } from "./common.js";

export const ScheduleVersionStatusSchema = z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]);
export type ScheduleVersionStatus = z.infer<typeof ScheduleVersionStatusSchema>;

export const ScheduleVersionSchema = z.object({
  id: z.string(),
  name: z.string(),
  effectiveDate: IsoDateSchema,
  sourceFileId: z.string(),
  status: ScheduleVersionStatusSchema,
});
export type ScheduleVersion = z.infer<typeof ScheduleVersionSchema>;
