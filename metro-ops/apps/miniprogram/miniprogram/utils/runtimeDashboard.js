const { apiRequest } = require("./api");
const { buildRuntimeSummary, findDutyForOperator } = require("./duty");
const {
  directionLabel,
  formatClockRange,
  formatDutyRoute,
  formatScheduleSource,
  formatStationPair,
  locationKindLabel,
  runtimeStatusLabel,
} = require("./format");

async function loadRuntimeDashboard(operator) {
  const runtime = await apiRequest("/api/runtime/duties");
  const rawDuties = Array.isArray(runtime?.duties) ? runtime.duties : [];
  const currentDuty = findDutyForOperator(rawDuties, operator);
  const duties = rawDuties.map((duty) => decorateDuty(duty, currentDuty));

  return {
    runtime,
    runtimeSummary: buildRuntimeSummary(runtime),
    currentDuty,
    duties,
    runningCount: duties.filter((duty) => duty.status === "RUNNING").length,
    dwellingCount: duties.filter((duty) => duty.status === "DWELLING").length,
  };
}

function decorateDuty(duty, currentDuty) {
  return {
    ...duty,
    dutyKey: `${duty.operatorId || duty.operatorName || "--"}-${duty.trainNo || "--"}-${duty.routeId || "--"}`,
    routeLabel: formatDutyRoute(duty),
    routeIdLabel: duty.routeId || "--",
    shiftLabel: duty.dutyShiftName || "未识别班次",
    directionText: directionLabel(duty.direction),
    stationPair: formatStationPair(duty),
    runtimeStatusLabel: runtimeStatusLabel(duty.status),
    locationKindLabel: locationKindLabel(duty.locationKind),
    timeRange: formatClockRange(
      duty.plannedDepartureTime,
      duty.plannedArrivalTime,
    ),
    scheduleSource: formatScheduleSource(duty),
    isCurrentDriverDuty: isSameDuty(duty, currentDuty),
  };
}

function isSameDuty(duty, currentDuty) {
  return (
    !!currentDuty &&
    duty.operatorId === currentDuty.operatorId &&
    duty.trainNo === currentDuty.trainNo
  );
}

module.exports = {
  decorateDuty,
  loadRuntimeDashboard,
};
