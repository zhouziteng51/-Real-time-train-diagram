import { z } from "zod";
import { DirectionSchema, IsoDateSchema, IsoDateTimeSchema } from "./common.js";

export const ImportSourceTypeSchema = z.enum(["XLSX", "DOCX", "PDF"]);
export type ImportSourceType = z.infer<typeof ImportSourceTypeSchema>;

export const ImportJobStatusSchema = z.enum([
  "UPLOADED",
  "PARSING",
  "REVIEW_REQUIRED",
  "NORMALIZED",
  "IMPORTED",
  "FAILED",
  "ARCHIVED",
]);
export type ImportJobStatus = z.infer<typeof ImportJobStatusSchema>;

export const ImportConfidenceSchema = z.object({
  trains: z.number().min(0).max(1),
  segments: z.number().min(0).max(1),
  duties: z.number().min(0).max(1),
});
export type ImportConfidence = z.infer<typeof ImportConfidenceSchema>;

export const ImportJobSchema = z.object({
  id: z.string(),
  sourceType: ImportSourceTypeSchema,
  fileName: z.string(),
  status: ImportJobStatusSchema,
  parserName: z.string(),
  confidence: ImportConfidenceSchema.optional(),
  confidenceScore: z.number().min(0).max(1).optional(),
  warnings: z.array(z.string()),
  errors: z.array(z.string()),
  createdBy: z.string(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  storageKey: z.string(),
});
export type ImportJob = z.infer<typeof ImportJobSchema>;

export const NormalizedImportDocumentSchema = z.object({
  meta: z.object({
    sourceType: ImportSourceTypeSchema,
    parserName: z.string(),
    fileName: z.string(),
    scheduleVersionName: z.string().optional(),
    extractedAt: IsoDateTimeSchema,
    confidence: ImportConfidenceSchema,
  }),
  trains: z.array(
    z.object({
      trainNo: z.string(),
      direction: DirectionSchema.optional(),
      routeId: z.string().optional(),
      vehicleId: z.string().optional(),
      stations: z.array(
        z.object({
          stationName: z.string(),
          stationCode: z.string().optional(),
          arrivalTime: z.string().optional(),
          departureTime: z.string().optional(),
          order: z.number().int().nonnegative(),
        }),
      ),
    }),
  ),
  circulationSegments: z.array(
    z.object({
      routeId: z.string(),
      fromStationName: z.string(),
      toStationName: z.string(),
      direction: DirectionSchema.optional(),
      startTime: z.string().optional(),
      endTime: z.string().optional(),
      linkedTrainNos: z.array(z.string()),
    }),
  ),
  dutyAssignments: z.array(
    z.object({
      operatorName: z.string().optional(),
      trainNo: z.string().optional(),
      routeId: z.string().optional(),
      dutyDate: IsoDateSchema.optional(),
      notes: z.string().optional(),
    }),
  ),
  warnings: z.array(z.string()),
  rawBlocks: z.array(
    z.object({
      page: z.number().int().nonnegative().optional(),
      text: z.string(),
      blockType: z.enum(["TABLE", "PARAGRAPH", "OCR"]),
    }),
  ),
});
export type NormalizedImportDocument = z.infer<typeof NormalizedImportDocumentSchema>;
