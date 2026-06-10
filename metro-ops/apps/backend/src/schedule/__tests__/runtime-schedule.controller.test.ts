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
import type { NormalizedImportDocument } from "@metro-ops/shared";
import { ImportDomainService } from "../../import/import.service.js";
import { ImportStore } from "../../import/import.store.js";
import { PdfOcrHybridParser } from "../../import/parsers/normalize.js";
import type { ParserFactory } from "../../import/parsers/parser.factory.js";
import type { RealtimeGateway } from "../../realtime/realtime.gateway.js";
import type { ObjectStorageService } from "../../storage/object-storage.service.js";
import { TripStore } from "../../trip/trip.store.js";
import {
  RuntimeScheduleController,
} from "../runtime-schedule.module.js";
import { RuntimeScheduleService } from "../runtime-schedule.service.js";

test("runtime duties controller returns live duties and all schedule duties together", () => {
  const store = new TripStore();
  store.upsertImportedDocument("job-runtime-g6001", buildScheduleForController(), {
    trains: true,
    segments: false,
    duties: true,
  });
  const service = new RuntimeScheduleService(store, {} as PdfOcrHybridParser);
  const controller = new RuntimeScheduleController(service);

  const response = controller.duties(
    new Date("2026-05-21T11:00:00.000Z"),
  );

  assert.equal(response.currentTime.localDate, "2026-05-21");
  assert.equal(response.activeSchedule.scheduleVersionId, "G6001");
  assert.deepEqual(
    response.duties.map((duty) => duty.trainNo),
    ["93002"],
  );
  assert.deepEqual(
    response.allDuties.map((duty) => duty.trainNo),
    ["93001", "93002", "93003"],
  );
  assert.deepEqual(
    response.allDuties.map((duty) => duty.locationKind),
    ["FINISHED", "BETWEEN_STATIONS", "NOT_STARTED"],
  );
});

test("confirming an import rebuilds runtime duties returned by controller", async () => {
  const dir = mkdtempSync(join(tmpdir(), "metro-ops-runtime-import-"));

  try {
    const trips = new TripStore();
    const imports = createImportStore(dir);
    const domain = new ImportDomainService(imports, trips);
    const service = new RuntimeScheduleService(trips, {} as PdfOcrHybridParser);
    const controller = new RuntimeScheduleController(service);
    const now = new Date("2026-05-21T11:00:00.000Z");

    assert.equal(controller.duties(now).activeSchedule.source, "FALLBACK");

    const doc = buildConfirmedImportSchedule();
    const job = imports.createJob({
      fileName: "G6001值乘导入.xlsx",
      sourceType: "XLSX",
      createdBy: "op-test",
      buffer: Buffer.from("raw-upload"),
    });
    imports.saveDoc(job.id, doc);
    imports.transition(job.id, { status: "PARSING" });
    imports.transition(job.id, {
      status: "NORMALIZED",
      parserName: doc.meta.parserName,
      confidence: doc.meta.confidence,
      confidenceScore: 1,
      warnings: [],
      errors: [],
    });

    await domain.confirmAndImport(job.id, {
      acceptedSections: { trains: true, segments: true, duties: true },
      targetScheduleVersionName: "G6001",
      dutyDate: "2026-05-21",
    });

    const response = controller.duties(now);

    assert.equal(imports.mustFindJob(job.id).status, "IMPORTED");
    assert.equal(response.activeSchedule.source, "IMPORTED");
    assert.equal(response.activeSchedule.scheduleVersionId, "G6001");
    assert.deepEqual(
      response.duties.map((duty) => duty.trainNo),
      ["95001"],
    );
    assert.deepEqual(
      response.allDuties.map((duty) => duty.trainNo),
      ["95001", "95002"],
    );
    assert.equal(response.duties[0]?.operatorName, "导入司机");
    assert.equal(response.duties[0]?.locationKind, "BETWEEN_STATIONS");
    assert.equal(response.allDuties[1]?.locationKind, "NOT_STARTED");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function buildScheduleForController(): NormalizedImportDocument {
  return {
    meta: {
      sourceType: "PDF",
      parserName: "test-runtime-controller",
      fileName: "G6001时刻表.pdf",
      scheduleVersionName: "G6001",
      extractedAt: "2026-05-21T00:00:00.000Z",
      confidence: { trains: 1, segments: 1, duties: 1 },
    },
    trains: [
      buildTrain("93001", "18:10:00", "18:30:00"),
      buildTrain("93002", "18:50:00", "19:10:00"),
      buildTrain("93003", "19:30:00", "19:50:00"),
    ],
    circulationSegments: [],
    dutyAssignments: [
      {
        operatorName: "当班司机",
        trainNo: "93002",
        routeId: "G6001-93002",
        dutyDate: "2026-05-21",
      },
    ],
    warnings: [],
    rawBlocks: [],
  };
}

function buildConfirmedImportSchedule(): NormalizedImportDocument {
  return {
    meta: {
      sourceType: "XLSX",
      parserName: "test-import-runtime",
      fileName: "G6001值乘导入.xlsx",
      scheduleVersionName: "待确认运行图",
      extractedAt: "2026-05-21T00:00:00.000Z",
      confidence: { trains: 1, segments: 1, duties: 1 },
    },
    trains: [
      buildTrain("95001", "18:50:00", "19:10:00"),
      buildTrain("95002", "19:30:00", "19:50:00"),
    ],
    circulationSegments: [],
    dutyAssignments: [
      {
        operatorName: "导入司机",
        trainNo: "95001",
        routeId: "G6001-95001",
      },
    ],
    warnings: [],
    rawBlocks: [],
  };
}

function buildTrain(
  trainNo: string,
  departureTime: string,
  arrivalTime: string,
): NormalizedImportDocument["trains"][number] {
  return {
    trainNo,
    routeId: `G6001-${trainNo}`,
    direction: "DOWN",
    stations: [
      {
        stationName: "徐州东站",
        departureTime,
        order: 0,
      },
      {
        stationName: "大湖站",
        arrivalTime,
        order: 1,
      },
    ],
  };
}

function createImportStore(dir: string): ImportStore {
  const realtime = {
    broadcast: () => undefined,
  } as unknown as RealtimeGateway;
  const objectStorage = new FileObjectStorage(
    dir,
  ) as unknown as ObjectStorageService;
  const parserFactory = {
    create: () => {
      throw new Error("parser should not be used when the parsed doc is saved");
    },
  } as unknown as ParserFactory;

  return new ImportStore(realtime, objectStorage, parserFactory);
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
