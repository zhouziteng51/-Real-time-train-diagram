import { Inject, Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { ImportJob, NormalizedImportDocument } from "@metro-ops/shared";
import { assertTransitionImport, WS_EVENTS, importJobRoom } from "@metro-ops/shared";
import { RealtimeGateway } from "../realtime/realtime.gateway.js";

export interface StoredFile {
  key: string;
  buffer: Buffer;
}

@Injectable()
export class ImportStore {
  private readonly logger = new Logger(ImportStore.name);
  private readonly jobs = new Map<string, ImportJob>();
  private readonly files = new Map<string, StoredFile>();
  private readonly docs = new Map<string, NormalizedImportDocument>();

  constructor(@Inject(RealtimeGateway) private readonly realtime: RealtimeGateway) {}

  createJob(params: {
    fileName: string;
    sourceType: ImportJob["sourceType"];
    createdBy: string;
    buffer: Buffer;
  }): ImportJob {
    const id = randomUUID();
    const key = `uploads/${id}/${params.fileName}`;
    this.files.set(key, { key, buffer: params.buffer });
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
    this.emit(job);
    return job;
  }

  readFile(key: string): Buffer {
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
  }

  getDoc(jobId: string): NormalizedImportDocument | undefined {
    return this.docs.get(jobId);
  }

  transition(jobId: string, patch: Partial<ImportJob> & { status: ImportJob["status"] }): ImportJob {
    const current = this.mustFindJob(jobId);
    assertTransitionImport(current.status, patch.status);
    const next: ImportJob = { ...current, ...patch, updatedAt: new Date().toISOString() };
    this.jobs.set(jobId, next);
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
}
