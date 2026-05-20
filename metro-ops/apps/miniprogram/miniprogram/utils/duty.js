const { apiRequest } = require("./api");

function buildRuntimeSummary(runtime) {
  const currentTime = runtime?.currentTime;
  const activeSchedule = runtime?.activeSchedule;
  return {
    timeLabel: currentTime
      ? `${currentTime.localDate} ${currentTime.localTime}`
      : "--",
    scheduleLabel: activeSchedule?.label || "--",
    scheduleSourceLabel: formatActiveSchedule(activeSchedule),
  };
}

async function loadCurrentOperator() {
  const app = getApp();
  const fallback = {
    operatorId: app.globalData?.operatorId || "op-001",
    operatorName: app.globalData?.operatorName || "司机",
    role: app.globalData?.operatorRole || "DRIVER",
  };

  try {
    const remote = await apiRequest("/api/operators/me");
    app.globalData.operatorId = remote.operatorId;
    app.globalData.operatorName = remote.operatorName;
    app.globalData.operatorRole = remote.role || "DRIVER";
    return remote;
  } catch (_error) {
    app.globalData.operatorId = fallback.operatorId;
    app.globalData.operatorName = fallback.operatorName;
    app.globalData.operatorRole = fallback.role;
    return fallback;
  }
}

async function loadCurrentDriverTrip(operator) {
  const [runtimeResult, activeResult] = await Promise.all([
    safeRequest("/api/runtime/duties"),
    safeRequest("/api/trips/active"),
  ]);

  const runtime = runtimeResult.ok ? runtimeResult.data : null;
  const activeTrips = activeResult.ok && Array.isArray(activeResult.data)
    ? activeResult.data
    : [];
  const duties = Array.isArray(runtime?.duties) ? runtime.duties : [];
  const currentDuty = findDutyForOperator(duties, operator);
  const dutyTrip =
    findTripForDuty(activeTrips, currentDuty) ||
    (currentDuty ? await loadTripDetailForDuty(currentDuty) : null);
  const assignedTrip = findTripForOperator(activeTrips, operator);
  const currentTrip = dutyTrip || assignedTrip || activeTrips[0] || null;

  return {
    runtime,
    activeTrips,
    currentDuty,
    currentTrip,
    source: dutyTrip
      ? "runtime-duty"
      : assignedTrip
        ? "active-assignment"
        : currentTrip
          ? "active-fallback"
          : "none",
  };
}

async function safeRequest(path) {
  try {
    return { ok: true, data: await apiRequest(path) };
  } catch (error) {
    return { ok: false, error };
  }
}

async function loadTripDetailForDuty(duty) {
  const tripId = importedTripIdForDuty(duty);
  if (!tripId) return null;
  try {
    const detail = await apiRequest(`/api/trips/${tripId}`);
    return detail.trip || null;
  } catch (_error) {
    return null;
  }
}

function findDutyForOperator(duties, operator) {
  return duties.find((duty) => dutyMatchesOperator(duty, operator)) || null;
}

function findTripForDuty(trips, duty) {
  if (!duty) return null;
  const sameScheduleTrips = trips.filter(
    (trip) =>
      !duty.scheduleVersionId ||
      sameText(trip.scheduleVersionId, duty.scheduleVersionId),
  );
  const candidates = sameScheduleTrips.length > 0 ? sameScheduleTrips : trips;

  return (
    candidates.find(
      (trip) =>
        sameTrainNo(trip.trainNo, duty.trainNo) &&
        sameOptionalText(trip.routeId, duty.routeId),
    ) ||
    candidates.find((trip) => sameTrainNo(trip.trainNo, duty.trainNo)) ||
    candidates.find((trip) => sameOptionalText(trip.routeId, duty.routeId)) ||
    null
  );
}

function findDutyForTrip(duties, trip) {
  if (!trip) return null;
  const sameScheduleDuties = duties.filter(
    (duty) =>
      !duty.scheduleVersionId ||
      sameText(duty.scheduleVersionId, trip.scheduleVersionId),
  );
  const candidates =
    sameScheduleDuties.length > 0 ? sameScheduleDuties : duties;

  return (
    candidates.find(
      (duty) =>
        sameTrainNo(duty.trainNo, trip.trainNo) &&
        sameOptionalText(duty.routeId, trip.routeId),
    ) ||
    candidates.find((duty) => sameTrainNo(duty.trainNo, trip.trainNo)) ||
    candidates.find((duty) => sameOptionalText(duty.routeId, trip.routeId)) ||
    null
  );
}

function findTripForOperator(trips, operator) {
  const operatorId = normalizeText(operator?.operatorId);
  if (!operatorId) return null;
  return (
    trips.find((trip) =>
      (trip.assignedOperatorIds || []).some(
        (assignedId) => normalizeText(assignedId) === operatorId,
      ),
    ) || null
  );
}

function dutyMatchesOperator(duty, operator) {
  const operatorId = normalizeText(operator?.operatorId);
  const operatorName = normalizeName(operator?.operatorName);
  return (
    (!!operatorId && normalizeText(duty.operatorId) === operatorId) ||
    (!!operatorName && normalizeName(duty.operatorName) === operatorName)
  );
}

function sameOptionalText(left, right) {
  if (!left || !right) return false;
  return sameText(left, right);
}

function sameText(left, right) {
  return normalizeText(left) === normalizeText(right);
}

function sameTrainNo(left, right) {
  const leftCode = normalizeText(left);
  const rightCode = normalizeText(right);
  if (!leftCode || !rightCode) return false;
  if (leftCode === rightCode) return true;
  return stripTrainPrefix(leftCode) === stripTrainPrefix(rightCode);
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();
}

function normalizeName(value) {
  return String(value || "").trim();
}

function stripTrainPrefix(value) {
  return value.replace(/^[A-Z]+/, "");
}

function importedTripIdForDuty(duty) {
  if (!duty?.scheduleVersionId || !duty.routeId || !duty.trainNo) return null;
  if (duty.scheduleVersionId === "demo-fallback") return null;
  const hash = shortHash(
    `${duty.scheduleVersionId}|${duty.routeId}|${duty.trainNo}`,
  );
  return `trip-import-${cleanIdPart(duty.trainNo) || "train"}-${hash}`;
}

function cleanIdPart(value) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function formatActiveSchedule(schedule) {
  if (!schedule) return "--";
  const source =
    schedule.source === "IMPORTED"
      ? schedule.sourceFileName || "已确认入库"
      : "内置兜底";
  return `${schedule.label}（${schedule.scheduleVersionId} · ${source}）`;
}

function shortHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

module.exports = {
  buildRuntimeSummary,
  findDutyForOperator,
  findDutyForTrip,
  findTripForDuty,
  loadCurrentDriverTrip,
  loadCurrentOperator,
};
