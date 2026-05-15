import { Injectable } from "@nestjs/common";
import type { ImportSourceType } from "@metro-ops/shared";
import { XlsxScheduleParser } from "./xlsx.parser.js";
import { DocxOcrHybridParser, PdfOcrHybridParser } from "./normalize.js";
import type { SourceParser } from "./types.js";

@Injectable()
export class ParserFactory {
  create(sourceType: ImportSourceType): SourceParser {
    switch (sourceType) {
      case "XLSX":
        return new XlsxScheduleParser();
      case "DOCX":
        return new DocxOcrHybridParser();
      case "PDF":
        return new PdfOcrHybridParser();
      default: {
        const _exhaustive: never = sourceType;
        throw new Error(`unsupported source type: ${String(_exhaustive)}`);
      }
    }
  }
}

export function detectSourceType(fileName: string): ImportSourceType {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return "XLSX";
  if (lower.endsWith(".docx") || lower.endsWith(".doc")) return "DOCX";
  if (lower.endsWith(".pdf")) return "PDF";
  throw new Error(`cannot detect source type from file: ${fileName}`);
}
