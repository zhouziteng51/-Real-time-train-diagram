import { z } from "zod";
import { IsoDateSchema } from "./common.js";

export const OperatorRoleSchema = z.enum(["DRIVER", "DISPATCHER"]);
export type OperatorRole = z.infer<typeof OperatorRoleSchema>;

export const OperatorContextSchema = z.object({
  operatorId: z.string(),
  operatorName: z.string(),
  role: OperatorRoleSchema,
  shiftId: z.string(),
  shiftDate: IsoDateSchema,
});
export type OperatorContext = z.infer<typeof OperatorContextSchema>;
