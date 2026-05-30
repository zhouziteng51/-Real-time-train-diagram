const assert = require("node:assert/strict");
const { test } = require("node:test");

global.getApp = () => ({
  globalData: {
    apiBaseUrl: "http://127.0.0.1:3000",
    wsBaseUrl: "ws://127.0.0.1:3001",
  },
});

global.wx = {
  getStorageSync: () => null,
};

const api = require("./api");
const { loadRuntimeDashboard } = require("./runtimeDashboard");

test("loadRuntimeDashboard keeps allDuties visible while matching current duty from live duties", async (t) => {
  const originalApiRequest = api.apiRequest;
  t.after(() => {
    api.apiRequest = originalApiRequest;
  });

  api.apiRequest = async (path) => {
    assert.equal(path, "/api/runtime/duties");
    return {
      currentTime: {
        localDate: "2026-05-22",
        localTime: "18:50:00",
      },
      activeSchedule: {
        scheduleVersionId: "G6001",
        label: "工作日 G6001 时刻表",
        source: "IMPORTED",
      },
      duties: [
        buildDuty({
          operatorId: "op-live",
          operatorName: "当班司机",
          trainNo: "G6001",
          status: "RUNNING",
          locationKind: "BETWEEN_STATIONS",
        }),
      ],
      allDuties: [
        buildDuty({
          operatorId: "op-finished",
          operatorName: "已终到司机",
          trainNo: "G6000",
          status: "STOPPED",
          locationKind: "FINISHED",
        }),
        buildDuty({
          operatorId: "op-live",
          operatorName: "当班司机",
          trainNo: "G6001",
          status: "RUNNING",
          locationKind: "BETWEEN_STATIONS",
        }),
        buildDuty({
          operatorId: "",
          operatorName: "",
          trainNo: "G6002",
          status: "STOPPED",
          locationKind: "NOT_STARTED",
        }),
      ],
    };
  };

  const dashboard = await loadRuntimeDashboard({
    operatorId: "op-live",
    operatorName: "当班司机",
  });

  assert.equal(dashboard.currentDuty?.trainNo, "G6001");
  assert.deepEqual(
    dashboard.duties.map((duty) => duty.trainNo),
    ["G6000", "G6001", "G6002"],
  );
  assert.equal(dashboard.runningCount, 1);
  assert.equal(dashboard.dwellingCount, 0);
  assert.equal(
    dashboard.duties.find((duty) => duty.trainNo === "G6001")
      ?.isCurrentDriverDuty,
    true,
  );
});

function buildDuty(overrides) {
  return {
    operatorId: "op-001",
    operatorName: "张三",
    trainNo: "G6001",
    routeId: "R-1042",
    scheduleVersionId: "G6001",
    scheduleVersionName: "G6001",
    direction: "DOWN",
    location: "徐州东站 - 大湖站",
    locationKind: "BETWEEN_STATIONS",
    previousStationName: "徐州东站",
    nextStationName: "大湖站",
    delaySeconds: 0,
    status: "RUNNING",
    plannedDepartureTime: "18:45:00",
    plannedArrivalTime: "19:10:00",
    calculatedAt: "2026-05-22T10:50:00.000Z",
    ...overrides,
  };
}
