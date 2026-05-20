import assert from "node:assert/strict";
import { test } from "node:test";
import type { TripEvent, TripTask } from "@metro-ops/shared";
import type { PostgresService } from "../../persistence/postgres.service.js";
import { type StoredScheduleVersion, TripStore } from "../trip.store.js";

test("history query can filter imported trips by schedule, train and date", () => {
  const store = new TripStore();
  store.upsertImportedDocument(
    "job-test",
    {
      meta: {
        sourceType: "XLSX",
        parserName: "test",
        fileName: "G6001排班.xlsx",
        scheduleVersionName: "G6001",
        extractedAt: "2026-05-19T00:00:00.000Z",
        confidence: { trains: 1, segments: 1, duties: 1 },
      },
      trains: [
        {
          trainNo: "00915",
          routeId: "G6001-白1",
          direction: "DOWN",
          stations: [
            {
              stationName: "徐州东站",
              departureTime: "08:00:00",
              order: 0,
            },
            {
              stationName: "铜山中医院站",
              arrivalTime: "09:00:00",
              order: 1,
            },
          ],
        },
      ],
      circulationSegments: [],
      dutyAssignments: [
        {
          operatorName: "白班测试",
          trainNo: "00915",
          routeId: "G6001-白1",
          dutyDate: "2026-05-19",
          notes: "班次:白班；交路号:白1",
        },
      ],
      warnings: [],
      rawBlocks: [],
    },
    { trains: true, segments: true, duties: true },
  );

  const bySchedule = store.queryHistory({ scheduleVersionId: "G6001" });
  assert.equal(bySchedule.length, 1);
  assert.equal(bySchedule[0]?.trainNo, "00915");

  const byTrain = store.queryHistory({
    scheduleVersionId: "G6001",
    trainNo: "00915",
  });
  assert.equal(byTrain.length, 1);

  const byDate = store.queryHistory({
    scheduleVersionId: "G6001",
    date: "2026-05-19",
  });
  assert.equal(byDate.length, 1);

  const miss = store.queryHistory({
    scheduleVersionId: "G6001",
    operatorName: "不存在",
  });
  assert.equal(miss.length, 0);
});

test("history query restores imported trips from postgres", async () => {
  const postgres = fakePostgres({
    versions: [
      {
        scheduleVersionId: "Z6001",
        scheduleVersionName: "Z6001",
        sourceJobId: "job-z6001",
        sourceFileName: "Z6001时刻表.pdf",
        importedAt: "2026-05-19T00:00:00.000Z",
        scheduleDate: "2026-05-19",
        acceptedSections: { trains: true, segments: true, duties: true },
      },
    ],
    duties: [
      {
        id: "duty-z6001-001",
        sourceJobId: "job-z6001",
        scheduleVersionId: "Z6001",
        importedAt: "2026-05-19T00:00:00.000Z",
        duty: {
          operatorName: "夜班测试",
          trainNo: "01014",
          routeId: "Z6001-夜1",
          dutyDate: "2026-05-19",
          notes: "班次:夜班；交路号:夜1",
        },
      },
    ],
    trips: [
      {
        trip: {
          id: "trip-import-01014-restore",
          trainNo: "01014",
          routeId: "Z6001-夜1",
          direction: "UP",
          originStationId: "铜山中医院站",
          terminalStationId: "徐州东站",
          scheduleVersionId: "Z6001",
          plannedDepartureAt: "2026-05-19T15:54:16+08:00",
          plannedArrivalAt: "2026-05-19T16:48:00+08:00",
          assignedOperatorIds: ["op-import-test"],
          status: "ARCHIVED",
        },
        stationTimes: [
          {
            stationName: "铜山中医院站",
            departureTime: "15:54:16",
            order: 0,
          },
          {
            stationName: "徐州东站",
            arrivalTime: "16:48:00",
            order: 1,
          },
        ],
      },
    ],
    events: [
      {
        id: "event-z6001-archive",
        tripId: "trip-import-01014-restore",
        kind: "ARCHIVE",
        fromStatus: "ARRIVING_TERMINAL",
        toStatus: "ARCHIVED",
        source: "OPERATOR",
        occurredAt: "2026-05-19T16:50:00+08:00",
      },
    ],
  });
  const store = new TripStore(postgres);

  await store.onModuleInit();

  const byOperator = store.queryHistory({
    scheduleVersionId: "Z6001",
    operatorName: "夜班测试",
    date: "2026-05-19",
  });
  assert.equal(byOperator.length, 1);
  assert.equal(byOperator[0]?.trainNo, "01014");
  assert.equal(store.historyEvents("trip-import-01014-restore").length, 1);
  assert.equal(store.listImportedTrains("Z6001")[0]?.data.stations.length, 2);
});

function fakePostgres(data: {
  versions: StoredScheduleVersion[];
  duties: Awaited<ReturnType<PostgresService["loadDuties"]>>;
  trips: Awaited<ReturnType<PostgresService["loadTrips"]>>;
  events: TripEvent[];
}): PostgresService {
  return {
    isEnabled: () => true,
    loadScheduleVersions: async () => data.versions,
    loadDuties: async () => data.duties,
    loadTrips: async () => data.trips,
    loadTripEvents: async () => data.events,
    upsertTrip: async (_trip: TripTask) => undefined,
    insertTripEvent: async (_event: TripEvent) => undefined,
    upsertScheduleVersion: async (_version: StoredScheduleVersion) => undefined,
    upsertDuty: async () => undefined,
  } as unknown as PostgresService;
}
