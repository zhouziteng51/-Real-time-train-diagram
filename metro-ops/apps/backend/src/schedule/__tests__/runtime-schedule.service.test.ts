import assert from "node:assert/strict";
import { test } from "node:test";
import type { NormalizedImportDocument } from "@metro-ops/shared";
import { PdfOcrHybridParser } from "../../import/parsers/normalize.js";
import { TripStore } from "../../trip/trip.store.js";
import { RuntimeScheduleService } from "../runtime-schedule.service.js";

test("runtime duties returns every train online at the current time", () => {
  const store = new TripStore();
  store.upsertImportedDocument(
    "job-runtime-g6001",
    buildScheduleWithLiveTrains(7),
    { trains: true, segments: false, duties: false },
  );
  const runtime = new RuntimeScheduleService(
    store,
    {} as PdfOcrHybridParser,
  );

  const liveDuties = runtime.listLiveDuties(
    new Date("2026-05-21T11:00:00.000Z"),
  );

  assert.equal(liveDuties.length, 7);
  assert.deepEqual(
    liveDuties.map((duty) => duty.trainNo),
    ["90001", "90002", "90003", "90004", "90005", "90006", "90007"],
  );
  assert.ok(
    liveDuties.every((duty) => duty.locationKind === "BETWEEN_STATIONS"),
  );
});

test("all schedule duties returns every train with blank operator when no roster is matched", () => {
  const store = new TripStore();
  store.upsertImportedDocument("job-runtime-g6001", buildMixedSchedule(), {
    trains: true,
    segments: false,
    duties: true,
  });
  const runtime = new RuntimeScheduleService(store, {} as PdfOcrHybridParser);

  const allDuties = runtime.listAllScheduleDuties(
    new Date("2026-05-21T11:00:00.000Z"),
  );

  assert.equal(allDuties.length, 3);
  assert.deepEqual(
    allDuties.map((duty) => duty.trainNo),
    ["91001", "91002", "91003"],
  );
  assert.deepEqual(
    allDuties.map((duty) => duty.locationKind),
    ["FINISHED", "BETWEEN_STATIONS", "NOT_STARTED"],
  );
  assert.deepEqual(
    allDuties.map((duty) => duty.status),
    ["STOPPED", "RUNNING", "STOPPED"],
  );
  assert.deepEqual(
    allDuties.map((duty) => duty.operatorName),
    ["已排班司机", "", ""],
  );
});

test("all schedule duties hides generated placeholder operator names", () => {
  const store = new TripStore();
  store.upsertImportedDocument("job-runtime-g6001", buildGeneratedNameSchedule(), {
    trains: true,
    segments: false,
    duties: true,
  });
  const runtime = new RuntimeScheduleService(store, {} as PdfOcrHybridParser);

  const allDuties = runtime.listAllScheduleDuties(
    new Date("2026-05-21T11:00:00.000Z"),
  );

  assert.equal(allDuties.length, 1);
  assert.equal(allDuties[0]?.operatorName, "");
});

function buildScheduleWithLiveTrains(
  trainCount: number,
): NormalizedImportDocument {
  return {
    meta: {
      sourceType: "PDF",
      parserName: "test-runtime",
      fileName: "G6001时刻表.pdf",
      scheduleVersionName: "G6001",
      extractedAt: "2026-05-21T00:00:00.000Z",
      confidence: { trains: 1, segments: 1, duties: 1 },
    },
    trains: Array.from({ length: trainCount }, (_, index) => {
      const trainNo = String(90001 + index);
      return {
        trainNo,
        routeId: `G6001-${trainNo}`,
        direction: "DOWN",
        stations: [
          {
            stationName: "徐州东站",
            departureTime: "18:50:00",
            order: 0,
          },
          {
            stationName: "大湖站",
            arrivalTime: "19:10:00",
            order: 1,
          },
        ],
      };
    }),
    circulationSegments: [],
    dutyAssignments: [],
    warnings: [],
    rawBlocks: [],
  };
}

function buildMixedSchedule(): NormalizedImportDocument {
  return {
    meta: {
      sourceType: "PDF",
      parserName: "test-runtime",
      fileName: "G6001时刻表.pdf",
      scheduleVersionName: "G6001",
      extractedAt: "2026-05-21T00:00:00.000Z",
      confidence: { trains: 1, segments: 1, duties: 1 },
    },
    trains: [
      buildTrain("91001", "18:10:00", "18:30:00"),
      buildTrain("91002", "18:50:00", "19:10:00"),
      buildTrain("91003", "19:30:00", "19:50:00"),
    ],
    circulationSegments: [],
    dutyAssignments: [
      {
        operatorName: "已排班司机",
        trainNo: "91001",
        routeId: "G6001-91001",
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

function buildGeneratedNameSchedule(): NormalizedImportDocument {
  return {
    meta: {
      sourceType: "PDF",
      parserName: "test-runtime",
      fileName: "G6001时刻表.pdf",
      scheduleVersionName: "G6001",
      extractedAt: "2026-05-21T00:00:00.000Z",
      confidence: { trains: 1, segments: 1, duties: 1 },
    },
    trains: [buildTrain("92001", "18:00:00", "19:00:00")],
    circulationSegments: [],
    dutyAssignments: [
      {
        operatorName: "早班01",
        trainNo: "92001",
        routeId: "G6001-92001",
        notes: "班次:早班；交路号:早1；人员来源:系统生成占位",
      },
    ],
    warnings: [],
    rawBlocks: [],
  };
}
