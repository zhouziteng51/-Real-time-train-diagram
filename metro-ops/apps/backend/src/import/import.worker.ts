import { Inject, Injectable, Logger } from "@nestjs/common";
import type { NormalizedImportDocument } from "@metro-ops/shared";
import { ImportStore } from "./import.store.js";
import { ParserFactory } from "./parsers/parser.factory.js";
import { overallScore, scoreDocument } from "./parsers/types.js";

@Injectable()
export class ImportParseWorker {
  private readonly logger = new Logger(ImportParseWorker.name);

  constructor(
    @Inject(ImportStore) private readonly store: ImportStore,
    @Inject(ParserFactory) private readonly factory: ParserFactory,
  ) {}

  async handle(jobId: string): Promise<void> {
    const job = this.store.mustFindJob(jobId);
    this.store.transition(jobId, { status: "PARSING" });

    try {
      const buffer = this.store.readFile(job.storageKey);
      const parser = this.factory.create(job.sourceType);
      const extracted = await parser.extract(buffer, { fileName: job.fileName });

      const confidence = scoreDocument(extracted);
      const overall = overallScore(confidence);
      const finalDoc: NormalizedImportDocument = {
        ...extracted,
        meta: { ...extracted.meta, confidence },
      };
      this.store.saveDoc(jobId, finalDoc);

      const nextStatus =
        overall < 0.85 || finalDoc.warnings.length > 0 ? "REVIEW_REQUIRED" : "NORMALIZED";

      this.store.transition(jobId, {
        status: nextStatus,
        parserName: parser.name,
        confidenceScore: overall,
        confidence,
        warnings: finalDoc.warnings,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`parse failed for ${jobId}: ${message}`);
      this.store.transition(jobId, { status: "FAILED", errors: [message] });
    }
  }
}
