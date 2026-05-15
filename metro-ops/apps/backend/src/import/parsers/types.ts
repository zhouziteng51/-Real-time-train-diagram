import type {
  ImportConfidence,
  ImportSourceType,
  NormalizedImportDocument,
} from "@metro-ops/shared";

export interface ParserContext {
  fileName: string;
}

export interface SourceParser {
  readonly name: string;
  readonly sourceType: ImportSourceType;
  extract(buffer: Buffer, ctx: ParserContext): Promise<NormalizedImportDocument>;
}

export function scoreDocument(doc: NormalizedImportDocument): ImportConfidence {
  const trainsScore = doc.trains.length === 0 ? 0 : clamp01(1 - doc.warnings.filter((w) => w.startsWith("train:")).length / Math.max(doc.trains.length, 1));
  const segmentsScore = doc.circulationSegments.length === 0
    ? 0
    : clamp01(1 - doc.warnings.filter((w) => w.startsWith("segment:")).length / Math.max(doc.circulationSegments.length, 1));
  const dutiesScore = doc.dutyAssignments.length === 0
    ? 0
    : clamp01(1 - doc.warnings.filter((w) => w.startsWith("duty:")).length / Math.max(doc.dutyAssignments.length, 1));
  return { trains: trainsScore, segments: segmentsScore, duties: dutiesScore };
}

export function overallScore(c: ImportConfidence): number {
  const weights = { trains: 0.6, segments: 0.3, duties: 0.1 };
  return c.trains * weights.trains + c.segments * weights.segments + c.duties * weights.duties;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
