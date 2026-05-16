import { Inject, Injectable } from "@nestjs/common";
import type { Direction, NormalizedImportDocument } from "@metro-ops/shared";
import { DEMO_OPERATORS } from "../operator/operator.fixtures.js";
import { FALLBACK_SCHEDULE_VERSION_ID, TripStore } from "../trip/trip.store.js";

type TrainDoc = NormalizedImportDocument["trains"][number];
type StationDoc = TrainDoc["stations"][number];
type DutyDoc = NormalizedImportDocument["dutyAssignments"][number];

export interface LiveTrainDuty {
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
export class RuntimeScheduleService {
  constructor(@Inject(TripStore) private readonly trips: TripStore) {}

  getActiveOperatingSchedule(now = new Date()): ActiveOperatingSchedule {
    return this.getRuntimeSnapshot(now).activeSchedule;
  }

  listLiveDuties(now = new Date()): LiveTrainDuty[] {
    const snapshot = this.getRuntimeSnapshot(now);
    const activeTrains = snapshot.trains
      .map((train) => ({ train, position: calculateTrainPosition(train, now) }))
      .filter(
        ({ position }) =>
          position.locationKind !== "NOT_STARTED" &&
          position.locationKind !== "FINISHED",
      )
      .sort(
        (a, b) =>
          clockTimeToSeconds(a.position.plannedDepartureTime ?? "23:59:59") -
            clockTimeToSeconds(b.position.plannedDepartureTime ?? "23:59:59") ||
          a.train.trainNo.localeCompare(b.train.trainNo),
      );

    return activeTrains
      .slice(0, DEMO_OPERATORS.length)
      .map(({ train, position }, index) => {
        const duty = findMatchingDuty(snapshot.duties, train);
        const operator = operatorForDuty(duty, index);
        return {
          operatorId: operator.operatorId,
          operatorName: operator.operatorName,
          trainNo: train.trainNo,
          routeId: train.routeId,
          scheduleVersionId: train.scheduleVersionId,
          scheduleVersionName: train.scheduleVersionName,
          direction: train.direction,
          ...position,
          delaySeconds: 0,
          status:
            position.locationKind === "AT_STATION" ? "DWELLING" : "RUNNING",
          calculatedAt: now.toISOString(),
        };
      });
  }

  private getRuntimeSnapshot(_now: Date): {
    activeSchedule: ActiveOperatingSchedule;
    trains: StoredTrain[];
    duties: DutyDoc[];
  } {
    const latest = this.trips.getLatestImportedScheduleVersion();
    if (!latest) {
      return {
        activeSchedule: {
          scheduleVersionId: FALLBACK_SCHEDULE_VERSION_ID,
          scheduleVersionName: "内置兜底时刻",
          label: "内置兜底时刻",
          source: "FALLBACK",
        },
        trains: FALLBACK_TRAINS,
        duties: [],
      };
    }

    return {
      activeSchedule: {
        scheduleVersionId: latest.scheduleVersionId,
        scheduleVersionName: latest.scheduleVersionName,
        label: latest.scheduleVersionName ?? latest.scheduleVersionId,
        source: "IMPORTED",
        importedAt: latest.importedAt,
        sourceFileName: latest.sourceFileName,
      },
      trains: this.trips
        .listImportedTrains(latest.scheduleVersionId)
        .filter((record) => record.data.stations.length > 0)
        .map((record) => ({
          ...record.data,
          scheduleVersionId: record.scheduleVersionId,
          scheduleVersionName: latest.scheduleVersionName,
        })),
      duties: this.trips
        .listImportedDuties(latest.scheduleVersionId)
        .map((record) => record.data),
    };
  }
}

function calculateTrainPosition(
  train: StoredTrain,
  now: Date,
): Omit<
  LiveTrainDuty,
  | "operatorId"
  | "operatorName"
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

function findMatchingDuty(
  duties: DutyDoc[],
  train: StoredTrain,
): DutyDoc | undefined {
  return duties.find(
    (duty) =>
      duty.trainNo === train.trainNo ||
      (train.routeId !== undefined && duty.routeId === train.routeId),
  );
}

function operatorForDuty(
  duty: DutyDoc | undefined,
  fallbackIndex: number,
): { operatorId: string; operatorName: string } {
  if (!duty?.operatorName) {
    const fallback = DEMO_OPERATORS[fallbackIndex % DEMO_OPERATORS.length]!;
    return {
      operatorId: fallback.operatorId,
      operatorName: fallback.operatorName,
    };
  }

  const known = DEMO_OPERATORS.find(
    (operator) => operator.operatorName === duty.operatorName,
  );
  return {
    operatorId:
      known?.operatorId ?? `op-import-${shortHash(duty.operatorName)}`,
    operatorName: duty.operatorName,
  };
}

function shortHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
