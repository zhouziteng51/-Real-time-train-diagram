import { Inject, Injectable, OnModuleInit, Optional } from "@nestjs/common";
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
import { PostgresService } from "../persistence/postgres.service.js";

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

export interface StoredTripTask extends TripTask {
  stationTimes?: ImportTrain["stations"] | undefined;
}

export interface StoredScheduleVersion {
  scheduleVersionId: string;
  scheduleVersionName?: string | undefined;
  sourceJobId: string;
  sourceFileName: string;
  importedAt: string;
  scheduleDate: string;
  acceptedSections: AcceptedImportSections;
}

interface ImportResult {
  scheduleVersionId: string;
  trains: number;
  segments: number;
  duties: number;
  projectedTrips: number;
}

interface UpsertImportedDocumentOptions {
  preserveScheduleVersionMetadata?: boolean;
  replaceDutyDate?: string | undefined;
  replaceDutyShiftNames?: string[] | undefined;
}

export const FALLBACK_SCHEDULE_VERSION_ID = "demo-fallback";

@Injectable()
export class TripStore implements OnModuleInit {
  private readonly trips = new Map<string, StoredTripTask>();
  private readonly events: TripEvent[] = [];
  private readonly demoTripIds = new Set<string>();
  private readonly importedTripIdsByVersion = new Map<string, Set<string>>();
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
  private readonly importedVersions = new Map<string, StoredScheduleVersion>();
  private latestImportedScheduleVersionId: string | undefined;
  private postgresRestorePromise: Promise<void> | undefined;
  private postgresRestoreCompleted = false;

  constructor(
    @Optional()
    @Inject(PostgresService)
    private readonly postgres?: PostgresService,
  ) {
    this.seed();
  }

  async onModuleInit(): Promise<void> {
    void this.bootstrapPostgresRestore();
  }

  async whenPostgresRestored(): Promise<void> {
    if (!this.postgres) return;
    if (this.postgresRestoreCompleted) return;
    if (!this.postgresRestorePromise) {
      this.postgresRestorePromise = this.restorePostgresSnapshot();
    }
    await this.postgresRestorePromise;
  }

  list(): StoredTripTask[] {
    return Array.from(this.trips.values()).sort(compareTripsByPlannedDeparture);
  }

  active(): StoredTripTask[] {
    return this.getOperationalTrips().filter(
      (t) =>
        t.status === "PLANNED" ||
        t.status === "ACTIVE" ||
        t.status === "ARRIVING_TERMINAL",
    );
  }

  mustFind(id: string): StoredTripTask {
    const trip = this.trips.get(id);
    if (!trip) throw new Error(`trip not found: ${id}`);
    return trip;
  }

  transition(input: TransitionInput): { trip: StoredTripTask; event: TripEvent } {
    const trip = this.mustFind(input.tripId);
    const toStatus = nextTripStatus(trip.status, input.event);
    const occurredAt = input.occurredAt ?? new Date().toISOString();

    const updated: StoredTripTask = { ...trip, status: toStatus };
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
    void this.persistTransition(updated, event);

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
  }): StoredTripTask[] {
    const hasSpecificFilter = Object.values(filter).some(
      (value) => value !== undefined && value !== "",
    );
    return this.getHistoryCandidateTrips(filter.scheduleVersionId).filter(
      (t) => {
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
      },
    );
  }

  upsertImportedDocument(
    jobId: string,
    doc: NormalizedImportDocument,
    acceptedSections: AcceptedImportSections,
    options: UpsertImportedDocumentOptions = {},
  ): ImportResult {
    const scheduleVersionId = buildScheduleVersionId(doc, jobId);
    const importedAt = new Date().toISOString();
    const scheduleDate = inferScheduleDate(doc) ?? importedAt.slice(0, 10);
    this.clearImportedVersionRecords(
      scheduleVersionId,
      acceptedSections,
      options,
    );
    const existingVersion = this.importedVersions.get(scheduleVersionId);
    if (options.preserveScheduleVersionMetadata && existingVersion) {
      const version: StoredScheduleVersion = {
        ...existingVersion,
        acceptedSections: {
          trains:
            existingVersion.acceptedSections.trains ||
            acceptedSections.trains,
          segments:
            existingVersion.acceptedSections.segments ||
            acceptedSections.segments,
          duties:
            existingVersion.acceptedSections.duties ||
            acceptedSections.duties,
        },
      };
      this.importedVersions.set(scheduleVersionId, version);
      void this.postgres?.upsertScheduleVersion(version);
    } else {
      const version: StoredScheduleVersion = {
        scheduleVersionId,
        scheduleVersionName: doc.meta.scheduleVersionName,
        sourceJobId: jobId,
        sourceFileName: doc.meta.fileName,
        importedAt,
        scheduleDate,
        acceptedSections,
      };
      this.importedVersions.set(scheduleVersionId, version);
      void this.postgres?.upsertScheduleVersion(version);
    }
    this.latestImportedScheduleVersionId = scheduleVersionId;

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
        const dutyId = importDutyKey(scheduleVersionId, duty);
        this.importedDuties.set(dutyId, {
          sourceJobId: jobId,
          scheduleVersionId,
          importedAt,
          data: duty,
        });
        void this.postgres?.upsertDuty({
          id: dutyId,
          sourceJobId: jobId,
          scheduleVersionId,
          importedAt,
          duty,
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

  getLatestImportedScheduleVersion(): StoredScheduleVersion | undefined {
    return this.latestImportedScheduleVersionId
      ? this.importedVersions.get(this.latestImportedScheduleVersionId)
      : undefined;
  }

  listImportedScheduleVersions(): StoredScheduleVersion[] {
    return Array.from(this.importedVersions.values()).sort((a, b) =>
      b.importedAt.localeCompare(a.importedAt),
    );
  }

  getImportedScheduleVersion(
    scheduleVersionName: string,
  ): StoredScheduleVersion | undefined {
    const normalized = normalizeScheduleKey(scheduleVersionName);
    return this.listImportedScheduleVersions().find(
      (version) =>
        normalizeScheduleKey(version.scheduleVersionName) === normalized ||
        normalizeScheduleKey(version.scheduleVersionId) === normalized ||
        normalizeScheduleKey(version.sourceFileName) === normalized,
    );
  }

  private clearImportedVersionRecords(
    scheduleVersionId: string,
    acceptedSections: AcceptedImportSections,
    options: UpsertImportedDocumentOptions,
  ): void {
    if (acceptedSections.trains)
      deleteMatchingRecords(this.importedTrains, scheduleVersionId);
    if (acceptedSections.segments)
      deleteMatchingRecords(this.importedSegments, scheduleVersionId);
    if (acceptedSections.duties) {
      deleteMatchingDutyRecords(
        this.importedDuties,
        scheduleVersionId,
        options.replaceDutyDate,
        options.replaceDutyShiftNames,
      );
    }
  }

  private getOperationalTrips(): StoredTripTask[] {
    const latest = this.getLatestImportedScheduleVersion();
    if (!latest) return this.listDemoTrips();
    return this.listImportedTripsForVersion(latest.scheduleVersionId);
  }

  private getHistoryCandidateTrips(
    scheduleVersionId?: string,
  ): StoredTripTask[] {
    if (scheduleVersionId) {
      return this.listTripsForScheduleVersion(scheduleVersionId);
    }

    return this.getOperationalTrips();
  }

  private listTripsForScheduleVersion(
    scheduleVersionId: string,
  ): StoredTripTask[] {
    if (this.importedVersions.has(scheduleVersionId)) {
      return this.listImportedTripsForVersion(scheduleVersionId);
    }

    if (this.getLatestImportedScheduleVersion()) return [];

    return this.list().filter(
      (trip) => trip.scheduleVersionId === scheduleVersionId,
    );
  }

  private listImportedTripsForVersion(
    scheduleVersionId: string,
  ): StoredTripTask[] {
    const ids = this.importedTripIdsByVersion.get(scheduleVersionId);
    if (!ids) return [];

    return this.list().filter((trip) => ids.has(trip.id));
  }

  private listDemoTrips(): StoredTripTask[] {
    return this.list().filter((trip) => this.demoTripIds.has(trip.id));
  }

  private seed() {
    const today = new Date().toISOString().slice(0, 10);
    const trips: StoredTripTask[] = [
      {
        id: "trip-demo-1",
        trainNo: "G6001",
        routeId: "R-1042",
        direction: "UP",
        originStationId: "铜山中医院站",
        terminalStationId: "徐州东站",
        scheduleVersionId: FALLBACK_SCHEDULE_VERSION_ID,
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
        scheduleVersionId: FALLBACK_SCHEDULE_VERSION_ID,
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
        scheduleVersionId: FALLBACK_SCHEDULE_VERSION_ID,
        plannedDepartureAt: `${today}T08:31:00+08:00`,
        plannedArrivalAt: `${today}T09:56:00+08:00`,
        assignedOperatorIds: ["op-003"],
        status: "ARRIVING_TERMINAL",
      },
    ];

    for (const trip of trips) {
      this.demoTripIds.add(trip.id);
      this.trips.set(trip.id, trip);
    }
  }

  private rebuildTripsForVersion(scheduleVersionId: string): number {
    const trains = this.listImportedTrains(scheduleVersionId);
    const previousTripIds =
      this.importedTripIdsByVersion.get(scheduleVersionId) ?? new Set<string>();
    const nextTripIds = new Set<string>();
    let projected = 0;

    for (const record of trains) {
      const trip = this.projectTrip(record);
      const existing = this.trips.get(trip.id);
      nextTripIds.add(trip.id);
      const nextTrip = {
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
      };
      this.trips.set(trip.id, nextTrip);
      void this.postgres?.upsertTrip(nextTrip);
      projected += 1;
    }

    for (const id of previousTripIds) {
      if (!nextTripIds.has(id)) this.trips.delete(id);
    }
    this.importedTripIdsByVersion.set(scheduleVersionId, nextTripIds);

    return projected;
  }

  private projectTrip(record: StoredImportRecord<ImportTrain>): StoredTripTask {
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
      this.importedVersions.get(record.scheduleVersionId)?.scheduleDate ??
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
        inferDirectionFromStationNames(
          firstStation?.stationName ?? segment?.fromStationName,
          lastStation?.stationName ?? segment?.toStationName,
        ) ??
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
      stationTimes: stations,
      ...(train.vehicleId ? { assignedVehicleId: train.vehicleId } : {}),
      status: "PLANNED",
    };
  }

  private tripMatchesOperatorName(
    trip: StoredTripTask,
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

  private async restoreFromPostgres(): Promise<void> {
    const [versions, duties, trips, events] = await Promise.all([
      this.postgres?.loadScheduleVersions() ?? [],
      this.postgres?.loadDuties() ?? [],
      this.postgres?.loadTrips() ?? [],
      this.postgres?.loadTripEvents() ?? [],
    ]);

    for (const version of versions) {
      this.importedVersions.set(version.scheduleVersionId, version);
      if (
        !this.latestImportedScheduleVersionId ||
        version.importedAt >
          (this.importedVersions.get(this.latestImportedScheduleVersionId)
            ?.importedAt ?? "")
      ) {
        this.latestImportedScheduleVersionId = version.scheduleVersionId;
      }
    }

    for (const duty of duties) {
      this.importedDuties.set(duty.id, {
        sourceJobId: duty.sourceJobId,
        scheduleVersionId: duty.scheduleVersionId,
        importedAt: duty.importedAt,
        data: duty.duty,
      });
    }

    for (const { trip, stationTimes } of trips) {
      const storedTrip: StoredTripTask = {
        ...trip,
        ...(stationTimes.length > 0 ? { stationTimes } : {}),
      };
      this.trips.set(storedTrip.id, storedTrip);
      if (this.importedVersions.has(storedTrip.scheduleVersionId)) {
        this.restoreImportedTrain(storedTrip, stationTimes);
        const ids =
          this.importedTripIdsByVersion.get(storedTrip.scheduleVersionId) ??
          new Set<string>();
        ids.add(storedTrip.id);
        this.importedTripIdsByVersion.set(storedTrip.scheduleVersionId, ids);
      }
    }

    this.events.splice(0, this.events.length, ...events);
  }

  private async bootstrapPostgresRestore(): Promise<void> {
    try {
      await this.whenPostgresRestored();
    } catch {
      // Keep startup resilient; runtime queries can still fall back to demo data.
    }
  }

  private async restorePostgresSnapshot(): Promise<void> {
    await this.postgres?.whenReady();
    if (!this.postgres?.isEnabled()) return;
    try {
      await this.restoreFromPostgres();
      this.postgresRestoreCompleted = true;
    } finally {
      this.postgresRestorePromise = undefined;
    }
  }

  private restoreImportedTrain(
    trip: StoredTripTask,
    stationTimes: ImportTrain["stations"],
  ): void {
    this.importedTrains.set(importTrainKey(trip.scheduleVersionId, trip), {
      sourceJobId:
        this.importedVersions.get(trip.scheduleVersionId)?.sourceJobId ??
        "postgres",
      scheduleVersionId: trip.scheduleVersionId,
      importedAt:
        this.importedVersions.get(trip.scheduleVersionId)?.importedAt ??
        new Date().toISOString(),
      data: {
        trainNo: trip.trainNo,
        direction: trip.direction,
        routeId: trip.routeId,
        ...(trip.assignedVehicleId
          ? { vehicleId: trip.assignedVehicleId }
          : {}),
        stations:
          stationTimes.length > 0
            ? stationTimes
            : fallbackStationTimesFromTrip(trip),
      },
    });
  }

  private async persistTransition(
    trip: StoredTripTask,
    event: TripEvent,
  ): Promise<void> {
    await this.postgres?.upsertTrip(trip);
    await this.postgres?.insertTripEvent(event);
  }
}

function compareTripsByPlannedDeparture(
  a: StoredTripTask,
  b: StoredTripTask,
): number {
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

function deleteMatchingRecords<T>(
  records: Map<string, StoredImportRecord<T>>,
  scheduleVersionId: string,
): void {
  for (const [key, record] of records) {
    if (record.scheduleVersionId === scheduleVersionId) records.delete(key);
  }
}

function deleteMatchingDutyRecords(
  records: Map<string, StoredImportRecord<ImportDuty>>,
  scheduleVersionId: string,
  dutyDate: string | undefined,
  shiftNames: string[] | undefined,
): void {
  const normalizedShifts = new Set(shiftNames?.filter(Boolean));
  for (const [key, record] of records) {
    if (record.scheduleVersionId !== scheduleVersionId) continue;
    if (dutyDate && record.data.dutyDate !== dutyDate) continue;
    if (normalizedShifts.size > 0) {
      const shiftName = dutyShiftName(record.data);
      if (!shiftName || !normalizedShifts.has(shiftName)) continue;
    }
    records.delete(key);
  }
}

function dutyShiftName(duty: ImportDuty): string | undefined {
  return duty.notes?.match(/班次:([^；]+)/)?.[1];
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

function importTrainKey(
  scheduleVersionId: string,
  train: Pick<ImportTrain, "trainNo">,
): string {
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

function fallbackStationTimesFromTrip(trip: StoredTripTask): ImportTrain["stations"] {
  return [
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
  ];
}

function inferDirectionFromTrainNo(trainNo: string): Direction {
  const lastDigit = trainNo.match(/\d(?=\D*$)/)?.[0];
  if (!lastDigit) return "UP";
  return Number(lastDigit) % 2 === 0 ? "DOWN" : "UP";
}

function inferDirectionFromStationNames(
  fromStationName: string | undefined,
  toStationName: string | undefined,
): Direction | undefined {
  if (!fromStationName || !toStationName) return undefined;
  const fromOrder = stationOrder(fromStationName);
  const toOrder = stationOrder(toStationName);
  if (fromOrder === toOrder) return undefined;
  return fromOrder < toOrder ? "DOWN" : "UP";
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

function normalizeScheduleKey(value: string | undefined): string | undefined {
  return value?.match(/[GZ]6001/i)?.[0].toUpperCase();
}

function shortHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
