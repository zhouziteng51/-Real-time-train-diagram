import assert from "node:assert/strict";
import { test } from "node:test";
import type { NormalizedImportDocument } from "@metro-ops/shared";
import { PdfOcrHybridParser } from "../../import/parsers/normalize.js";
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
