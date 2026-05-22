import { Inject, Injectable, Logger, OnModuleInit, Optional } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { ImportJob, NormalizedImportDocument } from "@metro-ops/shared";
import {
  NormalizedImportDocumentSchema,
  assertTransitionImport,
  WS_EVENTS,
  importJobRoom,
} from "@metro-ops/shared";
import { RealtimeGateway } from "../realtime/realtime.gateway.js";
import { PostgresService } from "../persistence/postgres.service.js";
import { ObjectStorageService } from "../storage/object-storage.service.js";
import { ParserFactory } from "./parsers/parser.factory.js";
import { overallScore, scoreDocument } from "./parsers/types.js";

export interface StoredFile {
  key: string;
  buffer: Buffer;
}

@Injectable()
export class ImportStore implements OnModuleInit {
  private readonly logger = new Logger(ImportStore.name);
  private readonly jobs = new Map<string, ImportJob>();
  private readonly files = new Map<string, StoredFile>();
  private readonly docs = new Map<string, NormalizedImportDocument>();

  constructor(
    @Inject(RealtimeGateway) private readonly realtime: RealtimeGateway,
    @Inject(ObjectStorageService)
    private readonly objectStorage: ObjectStorageService,
    @Inject(ParserFactory)
    private readonly parserFactory: ParserFactory,
    @Optional()
    @Inject(PostgresService)
    private readonly postgres?: PostgresService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.postgres?.isEnabled()) return;
    const jobs = await this.postgres.loadImportJobs();
    for (const job of jobs) this.jobs.set(job.id, job);
    if (jobs.length > 0) {
      this.logger.log(`restored ${jobs.length} import jobs from postgres`);
    }
  }

  createJob(params: {
    fileName: string;
    sourceType: ImportJob["sourceType"];
    createdBy: string;
    buffer: Buffer;
  }): ImportJob {
    const id = randomUUID();
    const key = `uploads/${id}/${params.fileName}`;
    this.files.set(key, { key, buffer: params.buffer });
    this.objectStorage.write(key, params.buffer);
    const now = new Date().toISOString();
    const job: ImportJob = {
      id,
      fileName: params.fileName,
      sourceType: params.sourceType,
      status: "UPLOADED",
      parserName: "",
      warnings: [],
      errors: [],
      createdBy: params.createdBy,
      createdAt: now,
      updatedAt: now,
      storageKey: key,
    };
    this.jobs.set(id, job);
    void this.postgres?.upsertImportJob(job);
    this.emit(job);
    return job;
  }

  readFile(key: string): Buffer {
    try {
      return this.objectStorage.read(key);
    } catch {
      // Keep the in-memory fallback for old jobs created before file storage.
    }
    const f = this.files.get(key);
    if (!f) throw new Error(`file not found: ${key}`);
    return f.buffer;
  }

  mustFindJob(id: string): ImportJob {
    const j = this.jobs.get(id);
    if (!j) throw new Error(`import job not found: ${id}`);
    return j;
  }

  saveDoc(jobId: string, doc: NormalizedImportDocument): void {
    this.docs.set(jobId, doc);
    this.objectStorage.write(docStorageKey(jobId), encodeDoc(doc));
  }

  async getDoc(jobId: string): Promise<NormalizedImportDocument | undefined> {
    const cached = this.docs.get(jobId);
    if (cached) return cached;

    const persisted = this.readPersistedDoc(jobId);
    if (persisted) return persisted;

    if (!this.jobs.has(jobId)) return undefined;
    return this.rebuildPersistedDoc(jobId);
  }

  transition(jobId: string, patch: Partial<ImportJob> & { status: ImportJob["status"] }): ImportJob {
    const current = this.mustFindJob(jobId);
    assertTransitionImport(current.status, patch.status);
    const next: ImportJob = { ...current, ...patch, updatedAt: new Date().toISOString() };
    this.jobs.set(jobId, next);
    void this.postgres?.upsertImportJob(next);
    this.emit(next);
    return next;
  }

  list(): ImportJob[] {
    return Array.from(this.jobs.values()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  private emit(job: ImportJob): void {
    this.realtime.broadcast(importJobRoom(job.id), {
      event: WS_EVENTS.ImportJobUpdated,
      job,
    });
  }

  private readPersistedDoc(jobId: string): NormalizedImportDocument | undefined {
    try {
      const parsed = JSON.parse(
        this.objectStorage.read(docStorageKey(jobId)).toString("utf8"),
      );
      const result = NormalizedImportDocumentSchema.safeParse(parsed);
      if (!result.success) {
        this.logger.warn(`stored parsed doc invalid for import job ${jobId}`);
        return undefined;
      }
      this.docs.set(jobId, result.data);
      return result.data;
    } catch {
      return undefined;
    }
  }

  private async rebuildPersistedDoc(
    jobId: string,
  ): Promise<NormalizedImportDocument | undefined> {
    const job = this.mustFindJob(jobId);
    if (
      job.status !== "REVIEW_REQUIRED" &&
      job.status !== "NORMALIZED" &&
      job.status !== "IMPORTED"
    ) {
      return undefined;
    }

    try {
      const parser = this.parserFactory.create(job.sourceType);
      const extracted = await parser.extract(this.readFile(job.storageKey), {
        fileName: job.fileName,
      });
      const confidence = scoreDocument(extracted);
      const doc: NormalizedImportDocument = {
        ...extracted,
        meta: { ...extracted.meta, confidence },
      };
      this.saveDoc(jobId, doc);

      const patch: Partial<ImportJob> = {
        parserName: parser.name,
        confidence,
        confidenceScore: overallScore(confidence),
        warnings: doc.warnings,
      };
      const current = this.mustFindJob(jobId);
      const next: ImportJob = {
        ...current,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      this.jobs.set(jobId, next);
      void this.postgres?.upsertImportJob(next);
      this.emit(next);
      this.logger.log(`rebuilt parsed document for import job ${jobId}`);
      return doc;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `could not rebuild parsed document for import job ${jobId}: ${message}`,
      );
      return undefined;
    }
  }
}

function docStorageKey(jobId: string): string {
  return `imports/${jobId}/normalized-document.json`;
}

function encodeDoc(doc: NormalizedImportDocument): Buffer {
  return Buffer.from(`${JSON.stringify(doc)}\n`, "utf8");
}
