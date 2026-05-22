import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { ImportStore } from "../import.store.js";
import { ImportDomainService } from "../import.service.js";
import type { RealtimeGateway } from "../../realtime/realtime.gateway.js";
import type { ObjectStorageService } from "../../storage/object-storage.service.js";
import type { ParserFactory } from "../parsers/parser.factory.js";
import type { PostgresService } from "../../persistence/postgres.service.js";
import type { TripStore } from "../../trip/trip.store.js";
import type { ImportJob, NormalizedImportDocument } from "@metro-ops/shared";

test("import store persists parsed docs to object storage and restores them", async () => {
  const dir = mkdtempSync(join(tmpdir(), "metro-ops-import-store-"));
  const jobs = new Map<string, ImportJob>();
  const store = createStore(dir, { jobs });

  const job = store.createJob({
    fileName: "G6001排班.xlsx",
    sourceType: "XLSX",
    createdBy: "op-1",
    buffer: Buffer.from("raw-upload"),
  });
  const doc = parsedDoc(job.fileName);

  store.saveDoc(job.id, doc);

  const saved = readFileSync(
    join(dir, `imports/${job.id}/normalized-document.json`),
    "utf8",
  );
  assert.match(saved, /"parserName":"test-parser"/);

  const restored = createStore(dir, { jobs });
  await restored.onModuleInit();
  assert.deepEqual(await restored.getDoc(job.id), doc);

  rmSync(dir, { recursive: true, force: true });
});

test("import store can rebuild parsed docs after restart for preview and confirm", async () => {
  const dir = mkdtempSync(join(tmpdir(), "metro-ops-import-rebuild-"));
  const jobs = new Map<string, ImportJob>();
  const parser = createParser();

  const first = createStore(dir, { jobs, parser });
  const job = first.createJob({
    fileName: "G6001排班.xlsx",
    sourceType: "XLSX",
    createdBy: "op-1",
    buffer: Buffer.from("raw-upload"),
  });
  await first.replaceJob({
    ...job,
    status: "NORMALIZED",
    parserName: "",
    confidence: undefined,
    confidenceScore: undefined,
    warnings: [],
    errors: [],
  });

  const restarted = createStore(dir, { jobs, parser });
  await restarted.onModuleInit();

  const doc = await restarted.getDoc(job.id);
  assert.ok(doc);
  assert.equal(doc.meta.parserName, "recovered-parser");
  assert.equal(parser.calls, 1);

  const persisted = readFileSync(
    join(dir, `imports/${job.id}/normalized-document.json`),
    "utf8",
  );
  assert.match(persisted, /"parserName":"recovered-parser"/);

  rmSync(dir, { recursive: true, force: true });
});

test("confirm can import a historical job after restart", async () => {
  const dir = mkdtempSync(join(tmpdir(), "metro-ops-import-confirm-"));
  const jobs = new Map<string, ImportJob>();
  const parser = createParser();
  const store = createStore(dir, { jobs, parser });
  const job = store.createJob({
    fileName: "G6001排班.xlsx",
    sourceType: "XLSX",
    createdBy: "op-1",
    buffer: Buffer.from("raw-upload"),
  });
  await store.replaceJob({
    ...job,
    status: "NORMALIZED",
    parserName: "recovered-parser",
    confidence: { trains: 0.9, segments: 0.8, duties: 0.7 },
    confidenceScore: 0.84,
    warnings: [],
    errors: [],
  });

  const restarted = createStore(dir, { jobs, parser });
  await restarted.onModuleInit();

  const upsertCalls: Array<{ jobId: string; acceptedSections: unknown }> = [];
  const domain = new ImportDomainService(restarted, fakeTripStore(upsertCalls));
  await domain.confirmAndImport(job.id, {
    acceptedSections: { trains: true, segments: true, duties: true },
    targetScheduleVersionName: "G6001",
    dutyDate: "2026-05-19",
  });

  assert.equal(restarted.mustFindJob(job.id).status, "IMPORTED");
  assert.equal(upsertCalls.length, 1);
  assert.equal(upsertCalls[0]?.jobId, job.id);

  rmSync(dir, { recursive: true, force: true });
});

function createStore(
  dir: string,
  options: {
    jobs?: Map<string, ImportJob>;
    parser?: ReturnType<typeof createParser>;
  } = {},
): ImportStore & { replaceJob(job: ImportJob): Promise<void> } {
  const jobs = options.jobs ?? new Map<string, ImportJob>();
  const realtime = {
    broadcast: () => undefined,
  } as unknown as RealtimeGateway;
  const objectStorage = new FileObjectStorage(dir);
  const parserFactory = {
    create: () => options.parser ?? createParser(),
  } as unknown as ParserFactory;
  const postgres = fakePostgres(jobs);
  const store = new ImportStore(realtime, objectStorage, parserFactory, postgres);
  return Object.assign(store, {
    async replaceJob(job: ImportJob): Promise<void> {
      jobs.set(job.id, job);
      await postgres.upsertImportJob(job);
    },
  });
}

function createParser(): {
  calls: number;
  name: string;
  extract: (
    buffer: Buffer,
    ctx: { fileName: string },
  ) => Promise<NormalizedImportDocument>;
} {
  return {
    calls: 0,
    name: "recovered-parser",
    async extract(
      buffer: Buffer,
      ctx: { fileName: string },
    ): Promise<NormalizedImportDocument> {
      this.calls += 1;
      assert.equal(buffer.toString("utf8"), "raw-upload");
      assert.equal(ctx.fileName, "G6001排班.xlsx");
      return parsedDoc(ctx.fileName, "recovered-parser");
    },
  };
}

function parsedDoc(
  fileName: string,
  parserName = "test-parser",
): NormalizedImportDocument {
  return {
    meta: {
      sourceType: "XLSX",
      parserName,
      fileName,
      extractedAt: "2026-05-19T00:00:00.000Z",
      confidence: { trains: 1, segments: 1, duties: 1 },
    },
    trains: [],
    circulationSegments: [],
    dutyAssignments: [],
    warnings: [],
    rawBlocks: [],
  };
}

function fakePostgres(jobs: Map<string, ImportJob>): PostgresService {
  return {
    isEnabled: () => true,
    loadImportJobs: async () => Array.from(jobs.values()),
    upsertImportJob: async (job: ImportJob) => {
      jobs.set(job.id, job);
    },
  } as unknown as PostgresService;
}

function fakeTripStore(
  calls: Array<{ jobId: string; acceptedSections: unknown }>,
): TripStore {
  return {
    upsertImportedDocument: (
      jobId: string,
      _doc: NormalizedImportDocument,
      acceptedSections: unknown,
    ) => {
      calls.push({ jobId, acceptedSections });
      return {
        scheduleVersionId: "G6001",
        trains: 0,
        segments: 0,
        duties: 0,
        projectedTrips: 0,
      };
    },
  } as unknown as TripStore;
}

class FileObjectStorage {
  constructor(private readonly rootDir: string) {}

  write(key: string, buffer: Buffer): void {
    const path = join(this.rootDir, key);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, buffer);
  }

  read(key: string): Buffer {
    return readFileSync(join(this.rootDir, key));
  }
}
