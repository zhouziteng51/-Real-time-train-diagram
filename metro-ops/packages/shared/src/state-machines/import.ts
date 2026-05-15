import type { ImportJobStatus } from "../domain/import.js";

export const IMPORT_TRANSITIONS: Readonly<Record<ImportJobStatus, readonly ImportJobStatus[]>> = {
  UPLOADED: ["PARSING", "FAILED"],
  PARSING: ["REVIEW_REQUIRED", "NORMALIZED", "FAILED"],
  REVIEW_REQUIRED: ["PARSING", "NORMALIZED", "FAILED"],
  NORMALIZED: ["IMPORTED", "FAILED"],
  IMPORTED: ["ARCHIVED"],
  FAILED: ["PARSING"],
  ARCHIVED: [],
};

export class IllegalImportTransition extends Error {
  readonly from: ImportJobStatus;
  readonly to: ImportJobStatus;
  constructor(from: ImportJobStatus, to: ImportJobStatus) {
    super(`illegal import job transition: ${from} -> ${to}`);
    this.name = "IllegalImportTransition";
    this.from = from;
    this.to = to;
  }
}

export function canTransitionImport(from: ImportJobStatus, to: ImportJobStatus): boolean {
  return IMPORT_TRANSITIONS[from].includes(to);
}

export function assertTransitionImport(from: ImportJobStatus, to: ImportJobStatus): void {
  if (!canTransitionImport(from, to)) throw new IllegalImportTransition(from, to);
}
