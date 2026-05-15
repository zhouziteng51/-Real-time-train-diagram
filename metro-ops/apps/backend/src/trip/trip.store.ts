import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type {
  ConfirmImportBody,
  Direction,
  NormalizedImportDocument,
  TripEvent,
  TripEventKind,
  TripEventSource,
  TripTask,
} from "@metro-ops/shared";
import { nextTripStatus } from "@metro-ops/shared";

export interface TransitionInput {
  tripId: string;
  event: TripEventKind;
  source: TripEventSource;
  actorOperatorId?: string;
  occurredAt?: string;
  payload?: Record<string, unknown>;
}

type AcceptedImportSections = ConfirmImportBody["acceptedSections"];
type ImportTrain = NormalizedImportDocument["trains"][number];
type ImportSegment = NormalizedImportDocument["circulationSegments"][number];
type ImportDuty = NormalizedImportDocument["dutyAssignments"][number];

interface StoredImportRecord<T> {
  sourceJobId: string;
  scheduleVersionId: string;
  importedAt: string;
  data: T;
}

interface ImportResult {
  scheduleVersionId: string;
  trains: number;
  segments: number;
  duties: number;
  projectedTrips: number;
}

@Injectable()
export class TripStore {
  private readonly trips = new Map<string, TripTask>();
  private readonly events: TripEvent[] = [];
  private readonly importedTrains = new Map<
    string,
    StoredImportRecord<ImportTrain>
  >();
  private readonly importedSegments = new Map<
    string,
    StoredImportRecord<ImportSegment>
  >();
  private readonly importedDuties = new Map<
    string,
    StoredImportRecord<ImportDuty>
  >();
  private readonly importDatesByVersion = new Map<string, string>();

  constructor() {
    this.seed();
  }

  list(): TripTask[] {
    return Array.from(this.trips.values()).sort(compareTripsByPlannedDeparture);
  }

  active(): TripTask[] {
    return this.list().filter(
      (t) =>
        t.status === "PLANNED" ||
        t.status === "ACTIVE" ||
        t.status === "ARRIVING_TERMINAL",
    );
  }

  mustFind(id: string): TripTask {
    const trip = this.trips.get(id);
    if (!trip) throw new Error(`trip not found: ${id}`);
    return trip;
  }

  transition(input: TransitionInput): { trip: TripTask; event: TripEvent } {
    const trip = this.mustFind(input.tripId);
    const toStatus = nextTripStatus(trip.status, input.event);
    const occurredAt = input.occurredAt ?? new Date().toISOString();

    const updated: TripTask = { ...trip, status: toStatus };
    if (input.event === "START" || input.event === "DEPART_ORIGIN") {
      updated.actualDepartureAt = updated.actualDepartureAt ?? occurredAt;
    }
    if (input.event === "ARCHIVE") {
      updated.actualArrivalAt = updated.actualArrivalAt ?? occurredAt;
    }
    this.trips.set(updated.id, updated);

    const event: TripEvent = {
      id: randomUUID(),
      tripId: trip.id,
      kind: input.event,
      fromStatus: trip.status,
      toStatus,
      source: input.source,
      actorOperatorId: input.actorOperatorId,
      occurredAt,
      payload: input.payload,
    };
    this.events.push(event);

    return { trip: updated, event };
  }

  historyEvents(tripId: string): TripEvent[] {
    return this.events.filter((e) => e.tripId === tripId);
  }

  queryHistory(filter: {
    tripId?: string;
    trainNo?: string;
    routeId?: string;
    scheduleVersionId?: string;
    operatorName?: string;
    date?: string;
  }): TripTask[] {
    const hasSpecificFilter = Object.values(filter).some(
      (value) => value !== undefined && value !== "",
    );
    return this.list().filter((t) => {
      if (filter.tripId && t.id !== filter.tripId) return false;
      if (filter.trainNo && t.trainNo !== filter.trainNo) return false;
      if (filter.routeId && t.routeId !== filter.routeId) return false;
      if (
        filter.scheduleVersionId &&
        t.scheduleVersionId !== filter.scheduleVersionId
      )
        return false;
      if (
        filter.operatorName &&
        !this.tripMatchesOperatorName(t, filter.operatorName)
      )
        return false;
      if (filter.date && !t.plannedDepartureAt.startsWith(filter.date))
        return false;
      if (!hasSpecificFilter)
        return t.status === "ARCHIVED" || t.status === "CANCELLED";
      return true;
    });
  }

  upsertImportedDocument(
    jobId: string,
    doc: NormalizedImportDocument,
    acceptedSections: AcceptedImportSections,
  ): ImportResult {
    const scheduleVersionId = buildScheduleVersionId(doc, jobId);
    const importedAt = new Date().toISOString();
    const scheduleDate = inferScheduleDate(doc) ?? importedAt.slice(0, 10);
    this.importDatesByVersion.set(scheduleVersionId, scheduleDate);

    let trains = 0;
    let segments = 0;
    let duties = 0;

    if (acceptedSections.segments) {
      for (const segment of doc.circulationSegments) {
        this.importedSegments.set(
          importSegmentKey(scheduleVersionId, segment),
          {
            sourceJobId: jobId,
            scheduleVersionId,
            importedAt,
            data: segment,
          },
        );
        segments += 1;
      }
    }

    if (acceptedSections.duties) {
      for (const duty of doc.dutyAssignments) {
        this.importedDuties.set(importDutyKey(scheduleVersionId, duty), {
          sourceJobId: jobId,
          scheduleVersionId,
          importedAt,
          data: duty,
        });
        duties += 1;
      }
    }

    if (acceptedSections.trains) {
      for (const train of doc.trains) {
        this.importedTrains.set(importTrainKey(scheduleVersionId, train), {
          sourceJobId: jobId,
          scheduleVersionId,
          importedAt,
          data: train,
        });
        trains += 1;
      }
    }

    const projectedTrips = this.rebuildTripsForVersion(scheduleVersionId);
    return { scheduleVersionId, trains, segments, duties, projectedTrips };
  }

  listImportedTrains(
    scheduleVersionId?: string,
  ): Array<StoredImportRecord<ImportTrain>> {
    return filterImportRecords(this.importedTrains, scheduleVersionId);
  }

  listImportedSegments(
    scheduleVersionId?: string,
  ): Array<StoredImportRecord<ImportSegment>> {
    return filterImportRecords(this.importedSegments, scheduleVersionId);
  }

  listImportedDuties(
    scheduleVersionId?: string,
  ): Array<StoredImportRecord<ImportDuty>> {
    return filterImportRecords(this.importedDuties, scheduleVersionId);
  }

  private seed() {
    const today = new Date().toISOString().slice(0, 10);
    const trips: TripTask[] = [
      {
        id: "trip-demo-1",
        trainNo: "G6001",
        routeId: "R-1042",
        direction: "UP",
        originStationId: "铜山中医院站",
        terminalStationId: "徐州东站",
        scheduleVersionId: "G6001",
        plannedDepartureAt: `${today}T08:15:00+08:00`,
        plannedArrivalAt: `${today}T09:40:00+08:00`,
        assignedOperatorIds: ["op-001"],
        status: "PLANNED",
      },
      {
        id: "trip-demo-2",
        trainNo: "Z6001",
        routeId: "R-1045",
        direction: "DOWN",
        originStationId: "徐州东站",
        terminalStationId: "铜山中医院站",
        scheduleVersionId: "Z6001",
        plannedDepartureAt: `${today}T08:22:00+08:00`,
        plannedArrivalAt: `${today}T09:47:00+08:00`,
        assignedOperatorIds: ["op-002"],
        status: "ACTIVE",
      },
      {
        id: "trip-demo-3",
        trainNo: "G6003",
        routeId: "R-1051",
        direction: "UP",
        originStationId: "铜山中医院站",
        terminalStationId: "徐州东站",
        scheduleVersionId: "G6001",
        plannedDepartureAt: `${today}T08:31:00+08:00`,
        plannedArrivalAt: `${today}T09:56:00+08:00`,
        assignedOperatorIds: ["op-003"],
        status: "ARRIVING_TERMINAL",
      },
    ];

    for (const trip of trips) this.trips.set(trip.id, trip);
  }

  private rebuildTripsForVersion(scheduleVersionId: string): number {
    const trains = this.listImportedTrains(scheduleVersionId);
    let projected = 0;

    for (const record of trains) {
      const trip = this.projectTrip(record);
      const existing = this.trips.get(trip.id);
      this.trips.set(trip.id, {
        ...trip,
        ...(existing
          ? {
              status: existing.status,
              ...(existing.actualDepartureAt
                ? { actualDepartureAt: existing.actualDepartureAt }
                : {}),
              ...(existing.actualArrivalAt
                ? { actualArrivalAt: existing.actualArrivalAt }
                : {}),
            }
          : {}),
      });
      projected += 1;
    }

    return projected;
  }

  private projectTrip(record: StoredImportRecord<ImportTrain>): TripTask {
    const train = record.data;
    const matchingSegments = this.listImportedSegments(
      record.scheduleVersionId,
    ).filter(
      (candidate) =>
        candidate.data.linkedTrainNos.includes(train.trainNo) ||
        (train.routeId !== undefined &&
          candidate.data.routeId === train.routeId),
    );
    const segment = matchingSegments[0]?.data;
    const routeId =
      train.routeId ?? segment?.routeId ?? `ROUTE-${train.trainNo}`;
    const duties = this.listImportedDuties(record.scheduleVersionId).filter(
      (candidate) =>
        candidate.data.trainNo === train.trainNo ||
        candidate.data.routeId === routeId,
    );
    const stations = [...train.stations].sort((a, b) => a.order - b.order);
    const firstStation = stations[0];
    const lastStation = stations[stations.length - 1];
    const scheduleDate =
      duties.find((duty) => duty.data.dutyDate)?.data.dutyDate ??
      this.importDatesByVersion.get(record.scheduleVersionId) ??
      record.importedAt.slice(0, 10);
    const departureClock =
      firstStation?.departureTime ??
      firstStation?.arrivalTime ??
      segment?.startTime ??
      duties
        .map((duty) => extractClockFromNotes(duty.data.notes, "开车时间"))
        .find(Boolean) ??
      "00:00";
    const arrivalClock =
      lastStation?.arrivalTime ??
      lastStation?.departureTime ??
      segment?.endTime ??
      duties
        .map((duty) => extractClockFromNotes(duty.data.notes, "退勤时间"))
        .find(Boolean) ??
      departureClock;

    return {
      id: importedTripId(record.scheduleVersionId, routeId, train.trainNo),
      trainNo: train.trainNo,
      routeId,
      direction:
        train.direction ??
        segment?.direction ??
        inferDirectionFromTrainNo(train.trainNo),
      originStationId:
        firstStation?.stationName ??
        segment?.fromStationName ??
        "UNKNOWN_START",
      terminalStationId:
        lastStation?.stationName ?? segment?.toStationName ?? "UNKNOWN_END",
      scheduleVersionId: record.scheduleVersionId,
      plannedDepartureAt: toIsoDateTime(scheduleDate, departureClock),
      plannedArrivalAt: toIsoDateTime(scheduleDate, arrivalClock),
      assignedOperatorIds: uniqueStrings(
        duties.map((duty) => operatorIdForName(duty.data.operatorName)),
      ),
      ...(train.vehicleId ? { assignedVehicleId: train.vehicleId } : {}),
      status: "PLANNED",
    };
  }

  private tripMatchesOperatorName(
    trip: TripTask,
    operatorName: string,
  ): boolean {
    return this.listImportedDuties(trip.scheduleVersionId).some((record) => {
      if (record.data.operatorName !== operatorName) return false;
      return (
        record.data.trainNo === trip.trainNo ||
        record.data.routeId === trip.routeId
      );
    });
  }
}

function compareTripsByPlannedDeparture(a: TripTask, b: TripTask): number {
  if (a.plannedDepartureAt === b.plannedDepartureAt)
    return a.trainNo.localeCompare(b.trainNo);
  return a.plannedDepartureAt.localeCompare(b.plannedDepartureAt);
}

function filterImportRecords<T>(
  records: Map<string, StoredImportRecord<T>>,
  scheduleVersionId: string | undefined,
): Array<StoredImportRecord<T>> {
  return Array.from(records.values()).filter(
    (record) =>
      scheduleVersionId === undefined ||
      record.scheduleVersionId === scheduleVersionId,
  );
}

function buildScheduleVersionId(
  doc: NormalizedImportDocument,
  jobId: string,
): string {
  return (
    cleanIdPart(doc.meta.scheduleVersionName ?? doc.meta.fileName) ||
    `import-${jobId.slice(0, 8)}`
  );
}

function importTrainKey(scheduleVersionId: string, train: ImportTrain): string {
  return `${scheduleVersionId}:${train.trainNo}`;
}

function importSegmentKey(
  scheduleVersionId: string,
  segment: ImportSegment,
): string {
  return [
    scheduleVersionId,
    segment.routeId,
    segment.fromStationName,
    segment.toStationName,
    segment.startTime ?? "",
    segment.endTime ?? "",
    segment.linkedTrainNos.join(","),
  ].join(":");
}

function importDutyKey(scheduleVersionId: string, duty: ImportDuty): string {
  return [
    scheduleVersionId,
    duty.operatorName ?? "",
    duty.trainNo ?? "",
    duty.routeId ?? "",
    duty.dutyDate ?? "",
    duty.notes ?? "",
  ].join(":");
}

function importedTripId(
  scheduleVersionId: string,
  routeId: string,
  trainNo: string,
): string {
  const hash = shortHash(`${scheduleVersionId}|${routeId}|${trainNo}`);
  return `trip-import-${cleanIdPart(trainNo) || "train"}-${hash}`;
}

function inferScheduleDate(doc: NormalizedImportDocument): string | undefined {
  return doc.dutyAssignments.find((duty) => duty.dutyDate)?.dutyDate;
}

function inferDirectionFromTrainNo(trainNo: string): Direction {
  const lastDigit = trainNo.match(/\d(?=\D*$)/)?.[0];
  if (!lastDigit) return "UP";
  return Number(lastDigit) % 2 === 0 ? "DOWN" : "UP";
}

function toIsoDateTime(date: string, value: string | undefined): string {
  const clock = normalizeClock(value) ?? "00:00:00";
  return `${date}T${clock}+08:00`;
}

function normalizeClock(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const text = value.trim();
  const withColon = text.match(/(\d{1,2})[:：](\d{2})(?:[:：](\d{2}))?/);
  if (withColon) {
    return formatClock(withColon[1], withColon[2], withColon[3]);
  }
  const compact = text.match(/(?:^|\D)(\d{1,2})(\d{2})(?:\D|$)/);
  if (compact) {
    return formatClock(compact[1], compact[2], undefined);
  }
  return undefined;
}

function formatClock(
  hour: string | undefined,
  minute: string | undefined,
  second: string | undefined,
): string | undefined {
  if (!hour || !minute) return undefined;
  const h = Number(hour);
  const m = Number(minute);
  const s = Number(second ?? "0");
  if (!Number.isInteger(h) || !Number.isInteger(m) || !Number.isInteger(s))
    return undefined;
  if (h < 0 || h > 23 || m < 0 || m > 59 || s < 0 || s > 59) return undefined;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function extractClockFromNotes(
  notes: string | undefined,
  label: string,
): string | undefined {
  if (!notes) return undefined;
  const part = notes
    .split("；")
    .find(
      (candidate) =>
        candidate.startsWith(`${label}:`) || candidate.startsWith(`${label}：`),
    );
  return normalizeClock(part);
}

function operatorIdForName(
  operatorName: string | undefined,
): string | undefined {
  if (!operatorName) return undefined;
  const known: Record<string, string> = {
    张三: "op-001",
    李四: "op-002",
    王五: "op-003",
  };
  return known[operatorName] ?? `op-import-${shortHash(operatorName)}`;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(
      values.filter(
        (value): value is string =>
          typeof value === "string" && value.length > 0,
      ),
    ),
  );
}

function cleanIdPart(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function shortHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
