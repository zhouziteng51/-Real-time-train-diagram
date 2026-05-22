import type {
  Direction,
  ImportJob,
  ImportSourceType,
  NormalizedImportDocument,
  RealtimeVehicleState,
  TripEvent,
  TripEventKind,
  TripEventSource,
  TripTask,
} from "@metro-ops/shared";
import { nextTripStatus } from "@metro-ops/shared";
import { isExplicitDemoApiEnabled } from "./config.js";

interface DemoApiOptions {
  method?: string | undefined;
  body?: unknown;
}

interface CurrentTimeResponse {
  iso: string;
  timeZone: "Asia/Shanghai";
  localDate: string;
  localTime: string;
}

interface ActiveOperatingSchedule {
  scheduleVersionId: string;
  scheduleVersionName?: string;
  label: string;
  source: "IMPORTED" | "FALLBACK";
  importedAt?: string;
  sourceFileName?: string;
}

const DEMO_SCHEDULE_VERSION_ID = "demo-static-2026";
const DEMO_OPERATORS = [
  { operatorId: "op-001", operatorName: "张三" },
  { operatorId: "op-002", operatorName: "李四" },
  { operatorId: "op-003", operatorName: "王五" },
  { operatorId: "op-004", operatorName: "赵六" },
] as const;

const activeSchedule: ActiveOperatingSchedule = {
  scheduleVersionId: DEMO_SCHEDULE_VERSION_ID,
  scheduleVersionName: "静态演示时刻",
  label: "G6001 / Z6001 演示运行图",
  source: "IMPORTED",
  importedAt: new Date().toISOString(),
  sourceFileName: "G6001时刻表.pdf / Z6001时刻表.pdf",
};

let demoTrips: TripTask[] = buildDemoTrips();
let demoEvents: Record<string, TripEvent[]> = buildDemoEvents(demoTrips);
let demoJobs: ImportJob[] = [buildDemoJob("demo-import-g6001", "G6001时刻表.pdf", "PDF", "IMPORTED")];
let demoDocs: Record<string, NormalizedImportDocument> = {
  "demo-import-g6001": buildDemoDocument("G6001时刻表.pdf", "PDF"),
};

export function shouldUseDemoApi(): boolean {
  return isExplicitDemoApiEnabled();
}

export function canFallbackToDemoApi(): boolean {
  return shouldUseDemoApi();
}

export async function demoApiFetch<T>(
  path: string,
  opts: DemoApiOptions = {},
): Promise<T> {
  const url = toUrl(path);
  const method = (opts.method ?? "GET").toUpperCase();
  const pathname = url.pathname;

  if (method === "GET" && pathname === "/api/runtime/time") {
    return currentShanghaiTime() as T;
  }

  if (method === "GET" && pathname === "/api/runtime/duties") {
    return {
      currentTime: currentShanghaiTime(),
      activeSchedule,
      duties: buildDemoDuties(),
    } as T;
  }

  if (method === "GET" && pathname === "/api/trips/active") {
    return demoTrips
      .filter((trip) =>
        ["PLANNED", "ACTIVE", "ARRIVING_TERMINAL"].includes(trip.status),
      )
      .sort(compareTrips) as T;
  }

  if (method === "GET" && pathname === "/api/trips/history") {
    return queryDemoTrips(url.searchParams) as T;
  }

  const tripAction = pathname.match(
    /^\/api\/trips\/([^/]+)\/(start|arrive-terminal|archive)$/,
  );
  if (method === "POST" && tripAction) {
    return mutateDemoTrip(tripAction[1]!, tripAction[2]!, opts.body) as T;
  }

  const tripDetail = pathname.match(/^\/api\/trips\/([^/]+)$/);
  if (method === "GET" && tripDetail) {
    const trip = findTrip(tripDetail[1]!);
    return { trip, events: demoEvents[trip.id] ?? [] } as T;
  }

  if (method === "GET" && pathname === "/api/imports") {
    return [...demoJobs].sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : -1,
    ) as T;
  }

  const importDetail = pathname.match(/^\/api\/imports\/([^/]+)(?:\/([^/]+))?$/);
  if (importDetail) {
    const jobId = importDetail[1]!;
    const action = importDetail[2];
    if (method === "GET" && !action) return findJob(jobId) as T;
    if (method === "GET" && action === "preview") return findDoc(jobId) as T;
    if (method === "POST" && action === "confirm") {
      return confirmDemoImport(jobId) as T;
    }
    if (method === "POST" && action === "reparse") {
      updateJob(jobId, { status: "REVIEW_REQUIRED" });
      return { status: "QUEUED" } as T;
    }
  }

  if (method === "GET" && pathname === "/api/operators") {
    return DEMO_OPERATORS.map((operator) => ({
      ...operator,
      role: "DRIVER",
      shiftId: "shift-demo-A",
      shiftDate: currentShanghaiTime().localDate,
    })) as T;
  }

  if (method === "GET" && pathname === "/api/operators/me") {
    const operator = DEMO_OPERATORS[0]!;
    return {
      ...operator,
      role: "DRIVER",
      shiftId: "shift-demo-A",
      shiftDate: currentShanghaiTime().localDate,
    } as T;
  }

  throw new Error(`demo api does not implement ${method} ${pathname}`);
}

export async function demoUploadImportFile(file: File): Promise<ImportJob> {
  const sourceType = detectSourceType(file.name);
  const id = `demo-import-${Date.now()}`;
  const job = buildDemoJob(id, file.name, sourceType, "REVIEW_REQUIRED");
  demoJobs = [job, ...demoJobs];
  demoDocs = { ...demoDocs, [id]: buildDemoDocument(file.name, sourceType) };
  return job;
}

export function getDemoRealtimeVehicles(): RealtimeVehicleState[] {
  const now = new Date();
  const wobble = Math.floor((now.getSeconds() % 10) - 5);
  return [
    {
      vehicleId: "V-G6001",
      trainNo: "G6001",
      routeId: "R-1042",
      tripId: "trip-demo-1",
      currentSegmentId: "SEG-TS-AT",
      speedKph: 68 + wobble,
      delaySeconds: 0,
      status: "RUNNING",
      updatedAt: now.toISOString(),
    },
    {
      vehicleId: "V-Z6001",
      trainNo: "Z6001",
      routeId: "R-1045",
      tripId: "trip-demo-2",
      currentStationId: "奥体中心站",
      speedKph: 0,
      delaySeconds: 35,
      status: "DWELLING",
      updatedAt: now.toISOString(),
    },
    {
      vehicleId: "V-G6003",
      trainNo: "G6003",
      routeId: "R-1051",
      tripId: "trip-demo-3",
      currentSegmentId: "SEG-DH-AT",
      speedKph: 55 - wobble,
      delaySeconds: -20,
      status: "RUNNING",
      updatedAt: now.toISOString(),
    },
  ];
}

function buildDemoTrips(): TripTask[] {
  return [
    buildTrip("trip-demo-1", "G6001", "R-1042", "UP", "铜山中医院站", "徐州东站", -18, 22, "ACTIVE", ["op-001"]),
    buildTrip("trip-demo-2", "Z6001", "R-1045", "DOWN", "徐州东站", "铜山中医院站", -6, 34, "ACTIVE", ["op-002"]),
    buildTrip("trip-demo-3", "G6003", "R-1051", "UP", "铜山中医院站", "徐州东站", -42, 4, "ARRIVING_TERMINAL", ["op-003"]),
    buildTrip("trip-demo-4", "G6005", "R-1056", "UP", "铜山中医院站", "徐州东站", 12, 56, "PLANNED", ["op-004"]),
    {
      ...buildTrip("trip-demo-5", "Z6003", "R-1048", "DOWN", "徐州东站", "铜山中医院站", -96, -52, "ARCHIVED", ["op-002"]),
      actualDepartureAt: shanghaiDateTimeAtOffset(-96),
      actualArrivalAt: shanghaiDateTimeAtOffset(-50),
    },
  ];
}

function buildTrip(
  id: string,
  trainNo: string,
  routeId: string,
  direction: Direction,
  originStationId: string,
  terminalStationId: string,
  departureOffsetMinutes: number,
  arrivalOffsetMinutes: number,
  status: TripTask["status"],
  assignedOperatorIds: string[],
): TripTask {
  return {
    id,
    trainNo,
    routeId,
    direction,
    originStationId,
    terminalStationId,
    scheduleVersionId: DEMO_SCHEDULE_VERSION_ID,
    plannedDepartureAt: shanghaiDateTimeAtOffset(departureOffsetMinutes),
    plannedArrivalAt: shanghaiDateTimeAtOffset(arrivalOffsetMinutes),
    actualDepartureAt:
      status === "ACTIVE" || status === "ARRIVING_TERMINAL"
        ? shanghaiDateTimeAtOffset(departureOffsetMinutes + 1)
        : undefined,
    assignedOperatorIds,
    assignedVehicleId: `V-${trainNo}`,
    status,
  };
}

function buildDemoEvents(trips: TripTask[]): Record<string, TripEvent[]> {
  const events: Record<string, TripEvent[]> = {};
  for (const trip of trips) {
    const tripEvents: TripEvent[] = [];
    if (trip.actualDepartureAt) {
      tripEvents.push({
        id: `${trip.id}-event-start`,
        tripId: trip.id,
        kind: "START",
        fromStatus: "PLANNED",
        toStatus: "ACTIVE",
        source: "SYSTEM",
        occurredAt: trip.actualDepartureAt,
      });
    }
    if (trip.status === "ARRIVING_TERMINAL" || trip.status === "ARCHIVED") {
      tripEvents.push({
        id: `${trip.id}-event-arrive`,
        tripId: trip.id,
        kind: "ARRIVE_TERMINAL",
        fromStatus: "ACTIVE",
        toStatus: "ARRIVING_TERMINAL",
        source: "REALTIME",
        occurredAt: shanghaiDateTimeAtOffset(-3),
      });
    }
    if (trip.status === "ARCHIVED" && trip.actualArrivalAt) {
      tripEvents.push({
        id: `${trip.id}-event-archive`,
        tripId: trip.id,
        kind: "ARCHIVE",
        fromStatus: "ARRIVING_TERMINAL",
        toStatus: "ARCHIVED",
        source: "OPERATOR",
        occurredAt: trip.actualArrivalAt,
      });
    }
    events[trip.id] = tripEvents;
  }
  return events;
}

function buildDemoDuties() {
  const now = new Date().toISOString();
  return [
    {
      operatorId: "op-001",
      operatorName: "张三",
      dutyRouteNo: "早1",
      dutyRouteId: "demo-static-2026-早1",
      dutyShiftName: "早班",
      trainNo: "G6001",
      routeId: "R-1042",
      scheduleVersionId: DEMO_SCHEDULE_VERSION_ID,
      scheduleVersionName: activeSchedule.scheduleVersionName,
      direction: "UP",
      location: "玉泉河站 → 奥体中心站",
      locationKind: "BETWEEN_STATIONS",
      previousStationName: "玉泉河站",
      nextStationName: "奥体中心站",
      delaySeconds: 0,
      status: "RUNNING",
      plannedDepartureTime: clockAtOffset(-18),
      plannedArrivalTime: clockAtOffset(22),
      calculatedAt: now,
    },
    {
      operatorId: "op-002",
      operatorName: "李四",
      dutyRouteNo: "白2",
      dutyRouteId: "demo-static-2026-白2",
      dutyShiftName: "白班",
      trainNo: "Z6001",
      routeId: "R-1045",
      scheduleVersionId: DEMO_SCHEDULE_VERSION_ID,
      scheduleVersionName: activeSchedule.scheduleVersionName,
      direction: "DOWN",
      location: "奥体中心站",
      locationKind: "AT_STATION",
      previousStationName: "徐州东站",
      nextStationName: "玉泉河站",
      delaySeconds: 35,
      status: "DWELLING",
      plannedDepartureTime: clockAtOffset(-6),
      plannedArrivalTime: clockAtOffset(34),
      calculatedAt: now,
    },
    {
      operatorId: "op-003",
      operatorName: "王五",
      dutyRouteNo: "夜3",
      dutyRouteId: "demo-static-2026-夜3",
      dutyShiftName: "夜班",
      trainNo: "G6003",
      routeId: "R-1051",
      scheduleVersionId: DEMO_SCHEDULE_VERSION_ID,
      scheduleVersionName: activeSchedule.scheduleVersionName,
      direction: "UP",
      location: "大湖站 → 奥体中心站",
      locationKind: "BETWEEN_STATIONS",
      previousStationName: "大湖站",
      nextStationName: "奥体中心站",
      delaySeconds: -20,
      status: "RUNNING",
      plannedDepartureTime: clockAtOffset(-42),
      plannedArrivalTime: clockAtOffset(4),
      calculatedAt: now,
    },
  ];
}

function queryDemoTrips(params: URLSearchParams): TripTask[] {
  const filtered = demoTrips.filter((trip) => {
    const tripId = params.get("tripId");
    const trainNo = params.get("trainNo");
    const routeId = params.get("routeId");
    const scheduleVersionId = params.get("scheduleVersionId");
    const date = params.get("date");
    const operatorName = params.get("operatorName");
    if (tripId && trip.id !== tripId) return false;
    if (trainNo && trip.trainNo !== trainNo) return false;
    if (routeId && trip.routeId !== routeId) return false;
    if (scheduleVersionId && trip.scheduleVersionId !== scheduleVersionId) {
      return false;
    }
    if (date && !trip.plannedDepartureAt.startsWith(date)) return false;
    if (operatorName && !tripMatchesOperator(trip, operatorName)) return false;
    return true;
  });
  const limit = Number(params.get("limit") ?? 50);
  return filtered.sort(compareTrips).slice(0, Number.isFinite(limit) ? limit : 50);
}

function mutateDemoTrip(tripId: string, action: string, body: unknown) {
  const trip = findTrip(tripId);
  const kind: TripEventKind =
    action === "start"
      ? "START"
      : action === "arrive-terminal"
        ? "ARRIVE_TERMINAL"
        : "ARCHIVE";
  const source: TripEventSource =
    kind === "ARRIVE_TERMINAL" &&
    isRecord(body) &&
    typeof body.source === "string"
      ? (body.source as TripEventSource)
      : "OPERATOR";
  const occurredAt = mutationOccurredAt(kind, body);
  const updated: TripTask = {
    ...trip,
    status: nextTripStatus(trip.status, kind),
    actualDepartureAt:
      kind === "START" ? (trip.actualDepartureAt ?? occurredAt) : trip.actualDepartureAt,
    actualArrivalAt: kind === "ARCHIVE" ? occurredAt : trip.actualArrivalAt,
  };
  demoTrips = demoTrips.map((candidate) =>
    candidate.id === tripId ? updated : candidate,
  );
  const event: TripEvent = {
    id: `event-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    tripId,
    kind,
    fromStatus: trip.status,
    toStatus: updated.status,
    source,
    occurredAt,
  };
  demoEvents = {
    ...demoEvents,
    [tripId]: [...(demoEvents[tripId] ?? []), event],
  };
  return { trip: updated, event };
}

function mutationOccurredAt(kind: TripEventKind, body: unknown): string {
  if (isRecord(body)) {
    if (kind === "START" && typeof body.actualDepartureAt === "string") {
      return body.actualDepartureAt;
    }
    if (kind === "ARRIVE_TERMINAL" && typeof body.occurredAt === "string") {
      return body.occurredAt;
    }
    if (kind === "ARCHIVE" && typeof body.actualArrivalAt === "string") {
      return body.actualArrivalAt;
    }
  }
  return new Date().toISOString();
}

function buildDemoJob(
  id: string,
  fileName: string,
  sourceType: ImportSourceType,
  status: ImportJob["status"],
): ImportJob {
  const now = new Date().toISOString();
  return {
    id,
    sourceType,
    fileName,
    status,
    parserName: sourceType === "PDF" ? "pdf-ocr-hybrid" : "xlsx-roster-parser",
    confidence: { trains: 0.96, segments: 0.91, duties: 0.88 },
    confidenceScore: 0.92,
    warnings: ["demo:static-preview"],
    errors: [],
    createdBy: "op-001",
    createdAt: now,
    updatedAt: now,
    storageKey: `demo/${id}/${fileName}`,
  };
}

function buildDemoDocument(
  fileName: string,
  sourceType: ImportSourceType,
): NormalizedImportDocument {
  const localDate = currentShanghaiTime().localDate;
  return {
    meta: {
      sourceType,
      parserName: sourceType === "PDF" ? "pdf-ocr-hybrid" : "xlsx-roster-parser",
      fileName,
      scheduleVersionName: "G6001 / Z6001 静态演示",
      extractedAt: new Date().toISOString(),
      confidence: { trains: 0.96, segments: 0.91, duties: 0.88 },
    },
    trains: [
      {
        trainNo: "G6001",
        direction: "UP",
        routeId: "R-1042",
        vehicleId: "V-G6001",
        stations: [
          { stationName: "铜山中医院站", departureTime: clockAtOffset(-18), order: 0 },
          { stationName: "玉泉河站", arrivalTime: clockAtOffset(-4), departureTime: clockAtOffset(-3), order: 1 },
          { stationName: "奥体中心站", arrivalTime: clockAtOffset(10), departureTime: clockAtOffset(11), order: 2 },
          { stationName: "徐州东站", arrivalTime: clockAtOffset(22), order: 3 },
        ],
      },
      {
        trainNo: "Z6001",
        direction: "DOWN",
        routeId: "R-1045",
        vehicleId: "V-Z6001",
        stations: [
          { stationName: "徐州东站", departureTime: clockAtOffset(-6), order: 0 },
          { stationName: "奥体中心站", arrivalTime: clockAtOffset(8), departureTime: clockAtOffset(10), order: 1 },
          { stationName: "玉泉河站", arrivalTime: clockAtOffset(23), departureTime: clockAtOffset(24), order: 2 },
          { stationName: "铜山中医院站", arrivalTime: clockAtOffset(34), order: 3 },
        ],
      },
      {
        trainNo: "G6003",
        direction: "UP",
        routeId: "R-1051",
        vehicleId: "V-G6003",
        stations: [
          { stationName: "铜山中医院站", departureTime: clockAtOffset(-42), order: 0 },
          { stationName: "大湖站", arrivalTime: clockAtOffset(-20), departureTime: clockAtOffset(-19), order: 1 },
          { stationName: "奥体中心站", arrivalTime: clockAtOffset(-2), departureTime: clockAtOffset(-1), order: 2 },
          { stationName: "徐州东站", arrivalTime: clockAtOffset(4), order: 3 },
        ],
      },
    ],
    circulationSegments: [
      {
        routeId: "R-1042",
        fromStationName: "铜山中医院站",
        toStationName: "徐州东站",
        direction: "UP",
        startTime: clockAtOffset(-18),
        endTime: clockAtOffset(22),
        linkedTrainNos: ["G6001"],
      },
      {
        routeId: "R-1045",
        fromStationName: "徐州东站",
        toStationName: "铜山中医院站",
        direction: "DOWN",
        startTime: clockAtOffset(-6),
        endTime: clockAtOffset(34),
        linkedTrainNos: ["Z6001"],
      },
    ],
    dutyAssignments: [
      {
        operatorName: "张三",
        trainNo: "G6001",
        routeId: "R-1042",
        dutyDate: localDate,
        notes: `班次:早班；交路号:R-1042；出勤时间:${clockAtOffset(-28)}；退勤时间:${clockAtOffset(32)}`,
      },
      {
        operatorName: "李四",
        trainNo: "Z6001",
        routeId: "R-1045",
        dutyDate: localDate,
        notes: `班次:白班；交路号:R-1045；出勤时间:${clockAtOffset(-16)}；退勤时间:${clockAtOffset(44)}`,
      },
      {
        operatorName: "王五",
        trainNo: "G6003",
        routeId: "R-1051",
        dutyDate: localDate,
        notes: `班次:夜班；交路号:R-1051；出勤时间:${clockAtOffset(-52)}；退勤时间:${clockAtOffset(14)}`,
      },
    ],
    warnings: ["演示环境使用内置解析结果，上传文件不会离开浏览器会话"],
    rawBlocks: [
      {
        text: "G6001 / Z6001 静态演示时刻与排班数据",
        blockType: "PARAGRAPH",
      },
    ],
  };
}

function confirmDemoImport(jobId: string): ImportJob {
  return updateJob(jobId, { status: "IMPORTED" });
}

function updateJob(jobId: string, patch: Partial<ImportJob>): ImportJob {
  const current = findJob(jobId);
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  demoJobs = demoJobs.map((job) => (job.id === jobId ? next : job));
  return next;
}

function findTrip(tripId: string): TripTask {
  const trip = demoTrips.find((candidate) => candidate.id === tripId);
  if (!trip) throw new Error(`demo trip not found: ${tripId}`);
  return trip;
}

function findJob(jobId: string): ImportJob {
  const job = demoJobs.find((candidate) => candidate.id === jobId);
  if (!job) throw new Error(`demo import job not found: ${jobId}`);
  return job;
}

function findDoc(jobId: string): NormalizedImportDocument {
  const doc = demoDocs[jobId];
  if (!doc) throw new Error(`demo import preview not found: ${jobId}`);
  return doc;
}

function tripMatchesOperator(trip: TripTask, operatorName: string): boolean {
  return trip.assignedOperatorIds.some((operatorId) => {
    const operator = DEMO_OPERATORS.find((item) => item.operatorId === operatorId);
    return operator?.operatorName.includes(operatorName);
  });
}

function compareTrips(a: TripTask, b: TripTask): number {
  return (
    a.plannedDepartureAt.localeCompare(b.plannedDepartureAt) ||
    a.trainNo.localeCompare(b.trainNo)
  );
}

function currentShanghaiTime(date = new Date()): CurrentTimeResponse {
  const parts = shanghaiParts(date);
  return {
    iso: date.toISOString(),
    timeZone: "Asia/Shanghai",
    localDate: `${parts.year}-${parts.month}-${parts.day}`,
    localTime: `${parts.hour}:${parts.minute}:${parts.second}`,
  };
}

function shanghaiDateTimeAtOffset(offsetMinutes: number): string {
  const parts = shanghaiParts(new Date(Date.now() + offsetMinutes * 60_000));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+08:00`;
}

function clockAtOffset(offsetMinutes: number): string {
  const parts = shanghaiParts(new Date(Date.now() + offsetMinutes * 60_000));
  return `${parts.hour}:${parts.minute}:${parts.second}`;
}

function shanghaiParts(date: Date): Record<"year" | "month" | "day" | "hour" | "minute" | "second", string> {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return {
    year: parts.year ?? "2026",
    month: parts.month ?? "01",
    day: parts.day ?? "01",
    hour: String(Number(parts.hour ?? 0) % 24).padStart(2, "0"),
    minute: parts.minute ?? "00",
    second: parts.second ?? "00",
  };
}

function toUrl(path: string): URL {
  const origin =
    typeof window === "undefined" ? "https://demo.local" : window.location.origin;
  return new URL(path, origin);
}

function detectSourceType(fileName: string): ImportSourceType {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "PDF";
  if (lower.endsWith(".docx")) return "DOCX";
  return "XLSX";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
