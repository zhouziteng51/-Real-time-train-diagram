import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import type { Direction, NormalizedImportDocument } from "@metro-ops/shared";
import { DEMO_OPERATORS } from "../operator/operator.fixtures.js";
import { FALLBACK_SCHEDULE_VERSION_ID, TripStore } from "../trip/trip.store.js";
import { readFile } from "node:fs/promises";
import { PdfOcrHybridParser } from "../import/parsers/normalize.js";

type TrainDoc = NormalizedImportDocument["trains"][number];
type StationDoc = TrainDoc["stations"][number];
type DutyDoc = NormalizedImportDocument["dutyAssignments"][number];

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
  locationKind: "AT_STATION" | "BETWEEN_STATIONS" | "NOT_STARTED" | "FINISHED";
  previousStationName?: string | undefined;
  nextStationName?: string | undefined;
  delaySeconds: number;
  status: "RUNNING" | "DWELLING" | "STOPPED";
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

interface StoredTrain extends TrainDoc {
  scheduleVersionId: string;
  scheduleVersionName?: string | undefined;
}

const DEFAULT_PDF_FILES = {
  G6001: "/Users/zhouziteng/Desktop/实时时刻表/G6001时刻表.pdf",
  Z6001: "/Users/zhouziteng/Desktop/实时时刻表/Z6001时刻表.pdf",
} as const;

const FALLBACK_TRAINS: StoredTrain[] = [
  {
    trainNo: "G6001",
    routeId: "R-1042",
    direction: "UP",
    scheduleVersionId: FALLBACK_SCHEDULE_VERSION_ID,
    scheduleVersionName: "内置兜底时刻",
    stations: [
      {
        stationName: "铜山中医院站",
        departureTime: "08:15:00",
        order: 0,
      },
      {
        stationName: "玉泉河站",
        arrivalTime: "08:35:00",
        departureTime: "08:36:30",
        order: 1,
      },
      {
        stationName: "奥体中心站",
        arrivalTime: "09:02:00",
        departureTime: "09:03:30",
        order: 2,
      },
      {
        stationName: "徐州东站",
        arrivalTime: "09:40:00",
        order: 3,
      },
    ],
  },
  {
    trainNo: "Z6001",
    routeId: "R-1045",
    direction: "DOWN",
    scheduleVersionId: FALLBACK_SCHEDULE_VERSION_ID,
    scheduleVersionName: "内置兜底时刻",
    stations: [
      {
        stationName: "徐州东站",
        departureTime: "08:22:00",
        order: 0,
      },
      {
        stationName: "奥体中心站",
        arrivalTime: "08:50:00",
        departureTime: "08:51:30",
        order: 1,
      },
      {
        stationName: "玉泉河站",
        arrivalTime: "09:18:00",
        departureTime: "09:19:30",
        order: 2,
      },
      {
        stationName: "铜山中医院站",
        arrivalTime: "09:47:00",
        order: 3,
      },
    ],
  },
  {
    trainNo: "G6003",
    routeId: "R-1051",
    direction: "UP",
    scheduleVersionId: FALLBACK_SCHEDULE_VERSION_ID,
    scheduleVersionName: "内置兜底时刻",
    stations: [
      {
        stationName: "铜山中医院站",
        departureTime: "08:31:00",
        order: 0,
      },
      {
        stationName: "大湖站",
        arrivalTime: "08:58:00",
        departureTime: "08:59:30",
        order: 1,
      },
      {
        stationName: "奥体中心站",
        arrivalTime: "09:25:00",
        departureTime: "09:26:30",
        order: 2,
      },
      {
        stationName: "徐州东站",
        arrivalTime: "09:56:00",
        order: 3,
      },
    ],
  },
];

@Injectable()
export class RuntimeScheduleService implements OnModuleInit {
  constructor(
    @Inject(TripStore) private readonly trips: TripStore,
    @Inject(PdfOcrHybridParser) private readonly pdfParser: PdfOcrHybridParser,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.loadDefaultPdfSchedules();
  }

  getActiveOperatingSchedule(now = new Date()): ActiveOperatingSchedule {
    return this.resolveOperatingSchedule(now).activeSchedule;
  }

  listLiveDuties(now = new Date()): LiveTrainDuty[] {
    const snapshot = this.resolveOperatingSchedule(now);
    const dutyDate = shanghaiLocalDate(now);
    const duties = snapshot.duties.filter(
      (duty) => !duty.dutyDate || duty.dutyDate === dutyDate,
    );
    const hasImportedDutyAssignments = duties.length > 0;
    const liveTrains = snapshot.trains
      .map((train) => ({ train, position: calculateTrainPosition(train, now) }))
      .filter(
        ({ position }) =>
          position.locationKind === "AT_STATION" ||
          position.locationKind === "BETWEEN_STATIONS",
      )
      .sort((a, b) => {
        const leftClock = clockTimeToSeconds(
          a.position.plannedDepartureTime ?? "23:59:59",
        );
        const rightClock = clockTimeToSeconds(
          b.position.plannedDepartureTime ?? "23:59:59",
        );
        if (leftClock !== rightClock) return leftClock - rightClock;
        return a.train.trainNo.localeCompare(b.train.trainNo);
      });

    return liveTrains.map(({ train, position }, index) => {
      return buildTrainDuty(train, position, duties, now, index, {
        hasImportedDutyAssignments,
        useDemoFallbackOperator: true,
      });
    });
  }

  listAllScheduleDuties(now = new Date()): LiveTrainDuty[] {
    const snapshot = this.resolveOperatingSchedule(now);
    const dutyDate = shanghaiLocalDate(now);
    const duties = snapshot.duties.filter(
      (duty) => !duty.dutyDate || duty.dutyDate === dutyDate,
    );

    return snapshot.trains
      .map((train) => ({ train, position: calculateTrainPosition(train, now) }))
      .sort((a, b) => {
        const leftClock = clockTimeToSeconds(
          a.position.plannedDepartureTime ?? "23:59:59",
        );
        const rightClock = clockTimeToSeconds(
          b.position.plannedDepartureTime ?? "23:59:59",
        );
        if (leftClock !== rightClock) return leftClock - rightClock;
        return a.train.trainNo.localeCompare(b.train.trainNo);
      })
      .map(({ train, position }, index) =>
        buildTrainDuty(train, position, duties, now, index, {
          hasImportedDutyAssignments: duties.length > 0,
          useDemoFallbackOperator: false,
        }),
      );
  }

  private resolveOperatingSchedule(now: Date): {
    activeSchedule: ActiveOperatingSchedule;
    trains: StoredTrain[];
    duties: DutyDoc[];
  } {
    const requested = this.pickOperatingScheduleForDate(now);
    const imported = this.trips.getImportedScheduleVersion(
      requested.scheduleVersionId,
    );

    if (!imported) {
      return {
        activeSchedule: {
          scheduleVersionId: FALLBACK_SCHEDULE_VERSION_ID,
          scheduleVersionName: "内置兜底时刻",
          label: requested.label,
          source: "FALLBACK",
          sourceFileName: requested.sourceFileName,
        },
        trains: this.getFallbackTrains(requested.scheduleVersionId),
        duties: [],
      };
    }

    return {
      activeSchedule: {
        scheduleVersionId: imported.scheduleVersionId,
        scheduleVersionName: imported.scheduleVersionName,
        label: requested.label,
        source: "IMPORTED",
        importedAt: imported.importedAt,
        sourceFileName: imported.sourceFileName,
      },
      trains: this.trips
        .list()
        .filter((trip) => trip.scheduleVersionId === imported.scheduleVersionId)
        .map((trip) => ({
          trainNo: trip.trainNo,
          direction: trip.direction,
          routeId: trip.routeId,
          ...(trip.assignedVehicleId
            ? { vehicleId: trip.assignedVehicleId }
            : {}),
          stations:
            trip.stationTimes && trip.stationTimes.length > 0
              ? trip.stationTimes
              : [
                  {
                    stationName: trip.originStationId,
                    departureTime: trip.plannedDepartureAt.slice(11, 19),
                    order: 0,
                  },
                  {
                    stationName: trip.terminalStationId,
                    arrivalTime: trip.plannedArrivalAt.slice(11, 19),
                    order: 1,
                  },
                ],
          scheduleVersionId: trip.scheduleVersionId,
          scheduleVersionName: imported.scheduleVersionName,
        })),
      duties: this.trips
        .listImportedDuties(imported.scheduleVersionId)
        .map((record) => record.data),
    };
  }

  private getFallbackTrains(scheduleVersionId: string): StoredTrain[] {
    if (normalizeScheduleKey(scheduleVersionId) === "Z6001")
      return this.createFallbackTrains("Z6001");
    return this.createFallbackTrains("G6001");
  }

  private createFallbackTrains(
    scheduleVersionName: "G6001" | "Z6001",
  ): StoredTrain[] {
    return FALLBACK_TRAINS.filter(
      (train) =>
        normalizeScheduleKey(train.scheduleVersionName) === scheduleVersionName ||
        normalizeScheduleKey(train.trainNo) === scheduleVersionName,
    );
  }

  private pickOperatingScheduleForDate(now: Date): {
    scheduleVersionId: "G6001" | "Z6001";
    label: string;
    sourceFileName: string;
  } {
    const weekday = shanghaiWeekday(now);
    if (weekday === 0 || weekday === 6) {
      return {
        scheduleVersionId: "Z6001",
        label: "周末 Z6001 时刻表",
        sourceFileName: "Z6001时刻表.pdf",
      };
    }
    return {
      scheduleVersionId: "G6001",
      label: "工作日 G6001 时刻表",
      sourceFileName: "G6001时刻表.pdf",
    };
  }

  private async loadDefaultPdfSchedules(): Promise<void> {
    for (const [scheduleVersionId, filePath] of Object.entries(
      DEFAULT_PDF_FILES,
    ) as Array<["G6001" | "Z6001", string]>) {
      try {
        const buffer = await readFile(filePath);
        const doc = await this.pdfParser.extract(buffer, {
          fileName: filePath.split("/").at(-1) ?? filePath,
        });
        const normalizedDoc: NormalizedImportDocument = {
          ...doc,
          meta: {
            ...doc.meta,
            scheduleVersionName: scheduleVersionId,
          },
          trains: doc.trains.map((train) => ({
            ...train,
            routeId: train.routeId ?? scheduleVersionId,
          })),
        };
        this.trips.upsertImportedDocument(
          `runtime-${scheduleVersionId}`,
          normalizedDoc,
          { trains: true, segments: true, duties: true },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[runtime] failed to load ${filePath}: ${message}`);
      }
    }
  }
}

function calculateTrainPosition(
  train: StoredTrain,
  now: Date,
): Omit<
  LiveTrainDuty,
  | "operatorId"
  | "operatorName"
  | "dutyRouteNo"
  | "dutyRouteId"
  | "dutyShiftName"
  | "trainNo"
  | "routeId"
  | "scheduleVersionId"
  | "scheduleVersionName"
  | "direction"
  | "delaySeconds"
  | "status"
  | "calculatedAt"
> {
  const nowSeconds = secondsSinceShanghaiMidnight(now);
  const stations = train.stations
    .filter((station) => station.arrivalTime || station.departureTime)
    .map((station) => ({
      ...station,
      arrivalSeconds: station.arrivalTime
        ? clockTimeToSeconds(station.arrivalTime)
        : undefined,
      departureSeconds: station.departureTime
        ? clockTimeToSeconds(station.departureTime)
        : undefined,
    }))
    .sort((a, b) => firstStationSeconds(a) - firstStationSeconds(b));

  const firstStation = stations[0];
  const lastStation = stations.at(-1);
  if (!firstStation || !lastStation) {
    return { location: "无时刻数据", locationKind: "FINISHED" };
  }

  const startSeconds =
    firstStation.departureSeconds ?? firstStation.arrivalSeconds ?? 0;
  const endSeconds =
    lastStation.arrivalSeconds ?? lastStation.departureSeconds ?? 0;
  if (nowSeconds < startSeconds) {
    return {
      location: `${firstStation.stationName}待发`,
      locationKind: "NOT_STARTED",
      nextStationName: firstStation.stationName,
      plannedDepartureTime:
        firstStation.departureTime ?? firstStation.arrivalTime,
      plannedArrivalTime: lastStation.arrivalTime ?? lastStation.departureTime,
    };
  }
  if (nowSeconds > endSeconds) {
    return {
      location: `${lastStation.stationName}已终到`,
      locationKind: "FINISHED",
      previousStationName: lastStation.stationName,
      plannedDepartureTime:
        firstStation.departureTime ?? firstStation.arrivalTime,
      plannedArrivalTime: lastStation.arrivalTime ?? lastStation.departureTime,
    };
  }

  for (let index = 0; index < stations.length; index += 1) {
    const station = stations[index]!;
    const arrivalSeconds = station.arrivalSeconds ?? station.departureSeconds;
    const departureSeconds = station.departureSeconds ?? station.arrivalSeconds;
    if (
      arrivalSeconds !== undefined &&
      departureSeconds !== undefined &&
      nowSeconds >= arrivalSeconds &&
      nowSeconds <= departureSeconds
    ) {
      return {
        location: station.stationName,
        locationKind: "AT_STATION",
        previousStationName: station.stationName,
        nextStationName: stations[index + 1]?.stationName,
        plannedDepartureTime:
          firstStation.departureTime ?? firstStation.arrivalTime,
        plannedArrivalTime:
          lastStation.arrivalTime ?? lastStation.departureTime,
      };
    }

    const next = stations[index + 1];
    const leaveSeconds = station.departureSeconds ?? station.arrivalSeconds;
    const nextArrivalSeconds = next?.arrivalSeconds ?? next?.departureSeconds;
    if (
      next &&
      leaveSeconds !== undefined &&
      nextArrivalSeconds !== undefined &&
      nowSeconds > leaveSeconds &&
      nowSeconds < nextArrivalSeconds
    ) {
      return {
        location: `${station.stationName} - ${next.stationName}`,
        locationKind: "BETWEEN_STATIONS",
        previousStationName: station.stationName,
        nextStationName: next.stationName,
        plannedDepartureTime:
          firstStation.departureTime ?? firstStation.arrivalTime,
        plannedArrivalTime:
          lastStation.arrivalTime ?? lastStation.departureTime,
      };
    }
  }

  return {
    location: lastStation.stationName,
    locationKind: "AT_STATION",
    previousStationName: lastStation.stationName,
    plannedDepartureTime:
      firstStation.departureTime ?? firstStation.arrivalTime,
    plannedArrivalTime: lastStation.arrivalTime ?? lastStation.departureTime,
  };
}

function buildTrainDuty(
  train: StoredTrain,
  position: ReturnType<typeof calculateTrainPosition>,
  duties: DutyDoc[],
  now: Date,
  fallbackIndex: number,
  options: {
    hasImportedDutyAssignments: boolean;
    useDemoFallbackOperator: boolean;
  },
): LiveTrainDuty {
  const duty = findMatchingDuty(duties, train);
  const dutyRoute = routeForDuty(duty, train);
  const operator = operatorForDuty(
    duty,
    fallbackIndex,
    options.hasImportedDutyAssignments,
    train.trainNo,
    options.useDemoFallbackOperator,
  );

  return {
    dutyRouteNo: dutyRoute.routeNo,
    dutyRouteId: dutyRoute.routeId,
    dutyShiftName: dutyRoute.shiftName,
    operatorId: operator.operatorId,
    operatorName: operator.operatorName,
    trainNo: train.trainNo,
    routeId: train.routeId,
    scheduleVersionId: train.scheduleVersionId,
    scheduleVersionName: train.scheduleVersionName,
    direction: inferDirectionFromStations(train.stations) ?? train.direction,
    ...position,
    delaySeconds: 0,
    status: statusForPosition(position.locationKind),
    calculatedAt: now.toISOString(),
  };
}

function statusForPosition(
  locationKind: LiveTrainDuty["locationKind"],
): LiveTrainDuty["status"] {
  if (locationKind === "AT_STATION") return "DWELLING";
  if (locationKind === "BETWEEN_STATIONS") return "RUNNING";
  return "STOPPED";
}

function secondsSinceShanghaiMidnight(date: Date): number {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return (
    (Number(parts.hour ?? 0) % 24) * 3600 +
    Number(parts.minute ?? 0) * 60 +
    Number(parts.second ?? 0)
  );
}

function firstStationSeconds(
  station: StationDoc & {
    arrivalSeconds?: number | undefined;
    departureSeconds?: number | undefined;
  },
): number {
  return (
    station.arrivalSeconds ??
    station.departureSeconds ??
    Number.MAX_SAFE_INTEGER
  );
}

function clockTimeToSeconds(value: string): number {
  const [hours = 0, minutes = 0, seconds = 0] = value.split(":").map(Number);
  return hours * 3600 + minutes * 60 + seconds;
}

function shanghaiWeekday(date: Date): number {
  const [year, month, day] = shanghaiLocalDate(date).split("-").map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1)).getUTCDay();
}

function shanghaiLocalDate(date: Date): string {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return `${parts.year ?? "1970"}-${parts.month ?? "01"}-${parts.day ?? "01"}`;
}

function normalizeScheduleKey(value: string | undefined): string | undefined {
  return value?.match(/[GZ]6001/i)?.[0].toUpperCase();
}

function inferDirectionFromStations(
  stations: StationDoc[],
): Direction | undefined {
  if (stations.length < 2) return undefined;
  const first = stations[0];
  const last = stations.at(-1);
  if (!first || !last) return undefined;
  const firstOrder = stationOrder(first.stationName);
  const lastOrder = stationOrder(last.stationName);
  if (firstOrder === lastOrder) return undefined;
  return firstOrder < lastOrder ? "DOWN" : "UP";
}

function stationOrder(stationName: string): number {
  const knownIndex = KNOWN_STATION_ORDER.indexOf(
    stationName as (typeof KNOWN_STATION_ORDER)[number],
  );
  return knownIndex >= 0 ? knownIndex : KNOWN_STATION_ORDER.length + 1;
}

const KNOWN_STATION_ORDER = [
  "徐州东站",
  "大湖站",
  "赵武站",
  "博览中心站",
  "奥体中心站",
  "一中南站",
  "市行政中心站",
  "丽水路站",
  "迎宾大道站",
  "市中医院站",
  "塘坊站",
  "检测园站",
  "驿城站",
  "高家营站",
  "玉泉河站",
  "铜山中医院站",
] as const;

function findMatchingDuty(
  duties: DutyDoc[],
  train: StoredTrain,
): DutyDoc | undefined {
  const trainNo = normalizeTrainNo(train.trainNo);
  return duties.find(
    (duty) =>
      normalizeTrainNo(duty.trainNo) === trainNo ||
      (trainNo !== undefined && extractTrainNos(duty.notes).includes(trainNo)) ||
      (train.routeId !== undefined && duty.routeId === train.routeId),
  );
}

function operatorForDuty(
  duty: DutyDoc | undefined,
  fallbackIndex: number,
  hasImportedDutyAssignments: boolean,
  trainNo: string,
  useDemoFallbackOperator: boolean,
): { operatorId: string; operatorName: string } {
  const operatorName = realOperatorName(duty);
  if (!operatorName) {
    if (!useDemoFallbackOperator) {
      return {
        operatorId: "",
        operatorName: "",
      };
    }
    if (hasImportedDutyAssignments) {
      return {
        operatorId: `unassigned-${trainNo}`,
        operatorName: "未分配",
      };
    }
    const fallback = DEMO_OPERATORS[fallbackIndex % DEMO_OPERATORS.length]!;
    return {
      operatorId: fallback.operatorId,
      operatorName: fallback.operatorName,
    };
  }

  const known = DEMO_OPERATORS.find(
    (operator) => operator.operatorName === operatorName,
  );
  return {
    operatorId: known?.operatorId ?? `op-import-${shortHash(operatorName)}`,
    operatorName,
  };
}

function realOperatorName(duty: DutyDoc | undefined): string | undefined {
  const operatorName = duty?.operatorName?.trim();
  if (!operatorName) return undefined;
  if (duty?.notes?.includes("人员来源:系统生成占位")) return undefined;
  if (/^(早|白|夜)班\d{2}$/.test(operatorName)) return undefined;
  return operatorName;
}

function routeForDuty(
  duty: DutyDoc | undefined,
  train: StoredTrain,
): {
  routeNo?: string | undefined;
  routeId?: string | undefined;
  shiftName?: string | undefined;
} {
  const routeNo = noteValue(duty?.notes, "交路号");
  const shiftName = noteValue(duty?.notes, "班次");
  return {
    routeNo: routeNo ?? duty?.routeId ?? train.routeId,
    routeId: duty?.routeId ?? train.routeId,
    shiftName,
  };
}

function noteValue(notes: string | undefined, key: string): string | undefined {
  return notes?.match(new RegExp(`${key}:([^；]+)`))?.[1];
}

function shortHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function extractTrainNos(value: string | undefined): string[] {
  if (!value) return [];
  return Array.from(
    new Set((value.match(/\d{5}/g) ?? []).map((trainNo) => trainNo.trim())),
  );
}

function normalizeTrainNo(value: string | undefined): string | undefined {
  return value?.match(/\d{5}/)?.[0];
}
