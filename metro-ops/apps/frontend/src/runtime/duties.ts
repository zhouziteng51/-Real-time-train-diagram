import type {
  Direction,
  OperatorContext,
  RealtimeVehicleStatus,
  TripTask,
} from "@metro-ops/shared";

export type RuntimeLocationKind =
  | "AT_STATION"
  | "BETWEEN_STATIONS"
  | "NOT_STARTED"
  | "FINISHED";

export interface CurrentTimeResponse {
  iso: string;
  timeZone: "Asia/Shanghai";
  localDate: string;
  localTime: string;
}

export interface LiveTrainDuty {
  dutyRouteNo?: string | undefined;
  dutyRouteId?: string | undefined;
  dutyShiftName?: string | undefined;
  operatorId: string;
  operatorName: string;
  trainNo: string;
  routeId?: string | undefined;
  scheduleVersionId: string;
  scheduleVersionName?: string | undefined;
  direction?: Direction | undefined;
  location: string;
  locationKind: RuntimeLocationKind;
  previousStationName?: string | undefined;
  nextStationName?: string | undefined;
  delaySeconds: number;
  status: Extract<RealtimeVehicleStatus, "RUNNING" | "DWELLING" | "STOPPED">;
  plannedDepartureTime?: string | undefined;
  plannedArrivalTime?: string | undefined;
  calculatedAt: string;
}

export interface ActiveOperatingSchedule {
  scheduleVersionId: string;
  scheduleVersionName?: string | undefined;
  label: string;
  source: "IMPORTED" | "FALLBACK";
  importedAt?: string | undefined;
  sourceFileName?: string | undefined;
}

export interface CurrentDutiesResponse {
  currentTime: CurrentTimeResponse;
  activeSchedule: ActiveOperatingSchedule;
  duties: LiveTrainDuty[];
}

export function findDutyForOperator(
  duties: LiveTrainDuty[],
  operator: Pick<OperatorContext, "operatorId" | "operatorName"> | undefined,
): LiveTrainDuty | undefined {
  return duties.find((duty) => dutyMatchesOperator(duty, operator));
}

export function findTripForDuty(
  trips: TripTask[],
  duty: LiveTrainDuty | undefined,
): TripTask | undefined {
  if (!duty) return undefined;
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
    ) ??
    candidates.find((trip) => sameTrainNo(trip.trainNo, duty.trainNo)) ??
    candidates.find((trip) => sameOptionalText(trip.routeId, duty.routeId))
  );
}

export function findDutyForTrip(
  duties: LiveTrainDuty[],
  trip: TripTask | undefined,
): LiveTrainDuty | undefined {
  if (!trip) return undefined;
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
    ) ??
    candidates.find((duty) => sameTrainNo(duty.trainNo, trip.trainNo)) ??
    candidates.find((duty) => sameOptionalText(duty.routeId, trip.routeId))
  );
}

export function findTripForOperator(
  trips: TripTask[],
  operator: Pick<OperatorContext, "operatorId"> | undefined,
): TripTask | undefined {
  const operatorId = normalizeText(operator?.operatorId);
  if (!operatorId) return undefined;
  return trips.find((trip) =>
    trip.assignedOperatorIds.some(
      (assignedId) => normalizeText(assignedId) === operatorId,
    ),
  );
}

export function importedTripIdForDuty(
  duty: LiveTrainDuty | undefined,
): string | undefined {
  if (!duty?.scheduleVersionId || !duty.routeId || !duty.trainNo) return undefined;
  if (duty.scheduleVersionId === "demo-fallback") return undefined;
  const hash = shortHash(
    `${duty.scheduleVersionId}|${duty.routeId}|${duty.trainNo}`,
  );
  return `trip-import-${cleanIdPart(duty.trainNo) || "train"}-${hash}`;
}

export function formatStationPair(duty: LiveTrainDuty): string {
  if (duty.locationKind === "AT_STATION") return "列车正在站内";
  if (duty.previousStationName && duty.nextStationName) {
    return `${duty.previousStationName} → ${duty.nextStationName}`;
  }
  if (duty.nextStationName) return `下一站：${duty.nextStationName}`;
  if (duty.previousStationName) return `上一站：${duty.previousStationName}`;
  return "逐站时刻已接入";
}

export function formatDutyRoute(duty: LiveTrainDuty): string {
  return duty.dutyRouteNo ?? duty.dutyRouteId ?? duty.routeId ?? "--";
}

export function formatTimeRange(
  start: string | undefined,
  end: string | undefined,
): string {
  if (!start && !end) return "--";
  return `${formatClock(start)} - ${formatClock(end)}`;
}

export function formatActiveSchedule(schedule: ActiveOperatingSchedule): string {
  const source =
    schedule.source === "IMPORTED"
      ? (schedule.sourceFileName ?? "已确认入库")
      : "无导入兜底";
  return `${schedule.label}（${schedule.scheduleVersionId} · ${source}）`;
}

export function formatScheduleSource(duty: LiveTrainDuty): string {
  return duty.scheduleVersionName
    ? `${duty.scheduleVersionName}（${duty.scheduleVersionId}）`
    : duty.scheduleVersionId;
}

function dutyMatchesOperator(
  duty: LiveTrainDuty,
  operator: Pick<OperatorContext, "operatorId" | "operatorName"> | undefined,
): boolean {
  const operatorId = normalizeText(operator?.operatorId);
  const operatorName = normalizeName(operator?.operatorName);
  return (
    (!!operatorId && normalizeText(duty.operatorId) === operatorId) ||
    (!!operatorName && normalizeName(duty.operatorName) === operatorName)
  );
}

function sameOptionalText(left: string | undefined, right: string | undefined) {
  if (!left || !right) return false;
  return sameText(left, right);
}

function sameText(left: string | undefined, right: string | undefined) {
  return normalizeText(left) === normalizeText(right);
}

function sameTrainNo(left: string | undefined, right: string | undefined) {
  const leftCode = normalizeText(left);
  const rightCode = normalizeText(right);
  if (!leftCode || !rightCode) return false;
  if (leftCode === rightCode) return true;
  return stripTrainPrefix(leftCode) === stripTrainPrefix(rightCode);
}

function normalizeText(value: string | undefined) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();
}

function normalizeName(value: string | undefined) {
  return String(value || "").trim();
}

function stripTrainPrefix(value: string) {
  return value.replace(/^[A-Z]+/, "");
}

function formatClock(value: string | undefined): string {
  if (!value) return "--";
  if (value.includes("T")) return value.slice(11, 16);
  return value.slice(0, 5);
}

function cleanIdPart(value: string) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function shortHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
