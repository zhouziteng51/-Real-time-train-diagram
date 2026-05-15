import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { readFile } from "node:fs/promises";
import type { Direction, NormalizedImportDocument } from "@metro-ops/shared";
import { DEMO_OPERATORS } from "../operator/operator.fixtures.js";
import { PdfOcrHybridParser } from "../import/parsers/normalize.js";

type TrainDoc = NormalizedImportDocument["trains"][number];
type StationDoc = TrainDoc["stations"][number];

export interface LiveTrainDuty {
  operatorId: string;
  operatorName: string;
  trainNo: string;
  routeId?: string | undefined;
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

export type OperatingScheduleId = "G6001" | "Z6001";

export interface ActiveOperatingSchedule {
  scheduleVersionName: OperatingScheduleId;
  label: string;
  calendarType: "WEEKDAY" | "WEEKEND";
}

interface StoredTrain extends TrainDoc {
  scheduleVersionName?: string | undefined;
}

const DEFAULT_PDF_FILES = [
  "/Users/zhouziteng/Desktop/G6001时刻表.pdf",
  "/Users/zhouziteng/Desktop/Z6001时刻表.pdf",
] as const;

@Injectable()
export class RuntimeScheduleService implements OnModuleInit {
  private readonly logger = new Logger(RuntimeScheduleService.name);
  private readonly trains = new Map<string, StoredTrain>();

  constructor(
    @Inject(PdfOcrHybridParser) private readonly pdfParser: PdfOcrHybridParser,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.loadDefaultPdfSchedules();
  }

  upsertImportedDocument(doc: NormalizedImportDocument): void {
    for (const train of doc.trains) {
      if (train.stations.length === 0) continue;
      this.trains.set(trainKey(train.trainNo, doc.meta.scheduleVersionName), {
        ...train,
        scheduleVersionName: doc.meta.scheduleVersionName,
      });
    }
  }

  getActiveOperatingSchedule(now = new Date()): ActiveOperatingSchedule {
    return activeOperatingSchedule(now);
  }

  listLiveDuties(now = new Date()): LiveTrainDuty[] {
    const activeSchedule = activeOperatingSchedule(now);
    const activeTrains = Array.from(this.trains.values())
      .filter((train) => trainMatchesSchedule(train, activeSchedule))
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
        const operator = DEMO_OPERATORS[index % DEMO_OPERATORS.length]!;
        return {
          operatorId: operator.operatorId,
          operatorName: operator.operatorName,
          trainNo: train.trainNo,
          routeId: train.routeId,
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

  private async loadDefaultPdfSchedules(): Promise<void> {
    for (const filePath of DEFAULT_PDF_FILES) {
      try {
        const buffer = await readFile(filePath);
        const doc = await this.pdfParser.extract(buffer, {
          fileName: filePath.split("/").at(-1) ?? filePath,
        });
        this.upsertImportedDocument(doc);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `default schedule load failed: ${filePath}: ${message}`,
        );
      }
    }
    this.logger.log(`runtime schedule loaded ${this.trains.size} trains`);
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

function trainKey(trainNo: string, scheduleVersionName?: string): string {
  return `${scheduleVersionName ?? "default"}:${trainNo}`;
}

function activeOperatingSchedule(date: Date): ActiveOperatingSchedule {
  const weekday = shanghaiWeekday(date);
  if (weekday === 0 || weekday === 6) {
    return {
      scheduleVersionName: "Z6001",
      label: "周末 Z6001 时刻表",
      calendarType: "WEEKEND",
    };
  }

  return {
    scheduleVersionName: "G6001",
    label: "工作日 G6001 时刻表",
    calendarType: "WEEKDAY",
  };
}

function trainMatchesSchedule(
  train: StoredTrain,
  schedule: ActiveOperatingSchedule,
): boolean {
  return (
    normalizeScheduleName(train.scheduleVersionName) ===
      schedule.scheduleVersionName ||
    normalizeScheduleName(train.routeId) === schedule.scheduleVersionName
  );
}

function normalizeScheduleName(value: string | undefined): string | undefined {
  const match = value?.match(/[GZ]6001/i);
  return match?.[0]?.toUpperCase();
}

function shanghaiWeekday(date: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return new Date(
    Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
    ),
  ).getUTCDay();
}
