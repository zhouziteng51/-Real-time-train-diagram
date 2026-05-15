import { z } from "zod";

export const DirectionSchema = z.enum(["UP", "DOWN"]);
export type Direction = z.infer<typeof DirectionSchema>;

export const IsoDateTimeSchema = z.string().datetime({ offset: true });
export type IsoDateTime = z.infer<typeof IsoDateTimeSchema>;

export const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export type IsoDate = z.infer<typeof IsoDateSchema>;
