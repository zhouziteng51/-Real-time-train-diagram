import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import pg from "pg";
import {
  ImportJobSchema,
  TripEventSchema,
  TripTaskSchema,
  type ImportJob,
  type NormalizedImportDocument,
  type TripEvent,
  type TripTask,
} from "@metro-ops/shared";
import type { StoredScheduleVersion } from "../trip/trip.store.js";
import { logError, logger } from "../observability/structured-logger.js";
import { POSTGRES_SCHEMA_SQL } from "./postgres.schema.js";

type ImportDuty = NormalizedImportDocument["dutyAssignments"][number];
type ImportTrain = NormalizedImportDocument["trains"][number];

@Injectable()
export class PostgresService implements OnModuleInit, OnModuleDestroy {
  private pool: pg.Pool | undefined;
  private ready = false;
  private readonly readyDeferred: {
    promise: Promise<void>;
    resolve: (() => void) | undefined;
  };

  constructor() {
    let resolve: (() => void) | undefined;
    const promise = new Promise<void>((done) => {
      resolve = done;
    });
    this.readyDeferred = { promise, resolve };
  }

  async onModuleInit(): Promise<void> {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      logger.info({ event: "postgres.disabled" }, "postgres disabled");
      this.readyDeferred.resolve?.();
      return;
    }

    this.pool = new pg.Pool({ connectionString });
    try {
      await this.pool.query(POSTGRES_SCHEMA_SQL);
      this.ready = true;
      logger.info({ event: "postgres.ready" }, "postgres ready");
    } catch (error) {
      this.ready = false;
      logError("postgres.init_failed", error);
    } finally {
      this.readyDeferred.resolve?.();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }

  isEnabled(): boolean {
    return this.ready && this.pool !== undefined;
  }

  whenReady(): Promise<void> {
    if (this.ready) return Promise.resolve();
    return this.readyDeferred.promise;
  }

  async upsertTrip(trip: TripTask): Promise<void> {
    await this.safeQuery(
      `insert into trip (
        id, train_no, route_id, direction, origin_station_id, terminal_station_id,
        schedule_version_id, planned_departure_at, planned_arrival_at,
        actual_departure_at, actual_arrival_at, assigned_operator_ids,
        assigned_vehicle_id, station_times, status, updated_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now())
      on conflict (id) do update set
        train_no = excluded.train_no,
        route_id = excluded.route_id,
        direction = excluded.direction,
        origin_station_id = excluded.origin_station_id,
        terminal_station_id = excluded.terminal_station_id,
        schedule_version_id = excluded.schedule_version_id,
        planned_departure_at = excluded.planned_departure_at,
        planned_arrival_at = excluded.planned_arrival_at,
        actual_departure_at = excluded.actual_departure_at,
        actual_arrival_at = excluded.actual_arrival_at,
        assigned_operator_ids = excluded.assigned_operator_ids,
        assigned_vehicle_id = excluded.assigned_vehicle_id,
        station_times = excluded.station_times,
        status = excluded.status,
        updated_at = now()`,
      [
        trip.id,
        trip.trainNo,
        trip.routeId,
        trip.direction,
        trip.originStationId,
        trip.terminalStationId,
        trip.scheduleVersionId,
        trip.plannedDepartureAt,
        trip.plannedArrivalAt,
        trip.actualDepartureAt ?? null,
        trip.actualArrivalAt ?? null,
        JSON.stringify(trip.assignedOperatorIds),
        trip.assignedVehicleId ?? null,
        JSON.stringify(tripStationTimes(trip)),
        trip.status,
      ],
      "postgres.upsert_trip_failed",
    );
  }

  async insertTripEvent(event: TripEvent): Promise<void> {
    await this.safeQuery(
      `insert into trip_events (
        id, trip_id, kind, from_status, to_status, source,
        actor_operator_id, occurred_at, payload
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      on conflict (id) do nothing`,
      [
        event.id,
        event.tripId,
        event.kind,
        event.fromStatus,
        event.toStatus,
        event.source,
        event.actorOperatorId ?? null,
        event.occurredAt,
        event.payload ? JSON.stringify(event.payload) : null,
      ],
      "postgres.insert_trip_event_failed",
    );
  }

  async upsertImportJob(job: ImportJob): Promise<void> {
    await this.safeQuery(
      `insert into import_jobs (
        id, source_type, file_name, status, parser_name, confidence,
        confidence_score, warnings, errors, created_by, created_at, updated_at,
        storage_key
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      on conflict (id) do update set
        source_type = excluded.source_type,
        file_name = excluded.file_name,
        status = excluded.status,
        parser_name = excluded.parser_name,
        confidence = excluded.confidence,
        confidence_score = excluded.confidence_score,
        warnings = excluded.warnings,
        errors = excluded.errors,
        updated_at = excluded.updated_at,
        storage_key = excluded.storage_key`,
      [
        job.id,
        job.sourceType,
        job.fileName,
        job.status,
        job.parserName,
        job.confidence ? JSON.stringify(job.confidence) : null,
        job.confidenceScore ?? null,
        JSON.stringify(job.warnings),
        JSON.stringify(job.errors),
        job.createdBy,
        job.createdAt,
        job.updatedAt,
        job.storageKey,
      ],
      "postgres.upsert_import_job_failed",
    );
  }

  async upsertScheduleVersion(version: StoredScheduleVersion): Promise<void> {
    await this.safeQuery(
      `insert into schedule_versions (
        schedule_version_id, schedule_version_name, source_job_id,
        source_file_name, imported_at, schedule_date, accepted_sections
      ) values ($1,$2,$3,$4,$5,$6,$7)
      on conflict (schedule_version_id) do update set
        schedule_version_name = excluded.schedule_version_name,
        source_job_id = excluded.source_job_id,
        source_file_name = excluded.source_file_name,
        imported_at = excluded.imported_at,
        schedule_date = excluded.schedule_date,
        accepted_sections = excluded.accepted_sections`,
      [
        version.scheduleVersionId,
        version.scheduleVersionName ?? null,
        version.sourceJobId,
        version.sourceFileName,
        version.importedAt,
        version.scheduleDate,
        JSON.stringify(version.acceptedSections),
      ],
      "postgres.upsert_schedule_version_failed",
    );
  }

  async upsertDuty(params: {
    id: string;
    sourceJobId: string;
    scheduleVersionId: string;
    importedAt: string;
    duty: ImportDuty;
  }): Promise<void> {
    await this.safeQuery(
      `insert into duties (
        id, schedule_version_id, source_job_id, imported_at, operator_name,
        train_no, route_id, duty_date, notes, data
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      on conflict (id) do update set
        schedule_version_id = excluded.schedule_version_id,
        source_job_id = excluded.source_job_id,
        imported_at = excluded.imported_at,
        operator_name = excluded.operator_name,
        train_no = excluded.train_no,
        route_id = excluded.route_id,
        duty_date = excluded.duty_date,
        notes = excluded.notes,
        data = excluded.data`,
      [
        params.id,
        params.scheduleVersionId,
        params.sourceJobId,
        params.importedAt,
        params.duty.operatorName ?? null,
        params.duty.trainNo ?? null,
        params.duty.routeId ?? null,
        params.duty.dutyDate ?? null,
        params.duty.notes ?? null,
        JSON.stringify(params.duty),
      ],
      "postgres.upsert_duty_failed",
    );
  }

  async loadImportJobs(): Promise<ImportJob[]> {
    const rows = await this.safeRows<ImportJobRow>(
      `select *
       from import_jobs
       order by created_at desc`,
      [],
      "postgres.load_import_jobs_failed",
    );
    return rows
      .map((row) => {
        const result = ImportJobSchema.safeParse({
          id: row.id,
          sourceType: row.source_type,
          fileName: row.file_name,
          status: row.status,
          parserName: row.parser_name,
          confidence: row.confidence ?? undefined,
          confidenceScore:
            row.confidence_score === null
              ? undefined
              : Number(row.confidence_score),
          warnings: asStringArray(row.warnings),
          errors: asStringArray(row.errors),
          createdBy: row.created_by,
          createdAt: toIso(row.created_at),
          updatedAt: toIso(row.updated_at),
          storageKey: row.storage_key,
        });
        return result.success ? result.data : undefined;
      })
      .filter((job): job is ImportJob => job !== undefined);
  }

  async loadScheduleVersions(): Promise<StoredScheduleVersion[]> {
    const rows = await this.safeRows<ScheduleVersionRow>(
      `select *
       from schedule_versions
       order by imported_at asc`,
      [],
      "postgres.load_schedule_versions_failed",
    );
    return rows.map((row) => ({
      scheduleVersionId: row.schedule_version_id,
      ...(row.schedule_version_name
        ? { scheduleVersionName: row.schedule_version_name }
        : {}),
      sourceJobId: row.source_job_id,
      sourceFileName: row.source_file_name,
      importedAt: toIso(row.imported_at),
      scheduleDate: toDate(row.schedule_date),
      acceptedSections: {
        trains: Boolean(row.accepted_sections?.trains),
        segments: Boolean(row.accepted_sections?.segments),
        duties: Boolean(row.accepted_sections?.duties),
      },
    }));
  }

  async loadDuties(): Promise<
    Array<{
      id: string;
      sourceJobId: string;
      scheduleVersionId: string;
      importedAt: string;
      duty: ImportDuty;
    }>
  > {
    const rows = await this.safeRows<DutyRow>(
      `select *
       from duties
       order by imported_at asc`,
      [],
      "postgres.load_duties_failed",
    );
    return rows.map((row) => ({
      id: row.id,
      sourceJobId: row.source_job_id,
      scheduleVersionId: row.schedule_version_id,
      importedAt: toIso(row.imported_at),
      duty: {
        ...asRecord(row.data),
        ...(row.operator_name ? { operatorName: row.operator_name } : {}),
        ...(row.train_no ? { trainNo: row.train_no } : {}),
        ...(row.route_id ? { routeId: row.route_id } : {}),
        ...(row.duty_date ? { dutyDate: toDate(row.duty_date) } : {}),
        ...(row.notes ? { notes: row.notes } : {}),
      },
    }));
  }

  async loadTrips(): Promise<
    Array<{ trip: TripTask; stationTimes: ImportTrain["stations"] }>
  > {
    const rows = await this.safeRows<TripRow>(
      `select *
       from trip
       order by planned_departure_at asc`,
      [],
      "postgres.load_trips_failed",
    );
    return rows
      .map((row) => {
        const stationTimes = asStationTimes(row.station_times);
        const result = TripTaskSchema.safeParse({
          id: row.id,
          trainNo: row.train_no,
          routeId: row.route_id,
          direction: row.direction,
          originStationId: row.origin_station_id,
          terminalStationId: row.terminal_station_id,
          scheduleVersionId: row.schedule_version_id,
          plannedDepartureAt: toIso(row.planned_departure_at),
          plannedArrivalAt: toIso(row.planned_arrival_at),
          actualDepartureAt: row.actual_departure_at
            ? toIso(row.actual_departure_at)
            : undefined,
          actualArrivalAt: row.actual_arrival_at
            ? toIso(row.actual_arrival_at)
            : undefined,
          assignedOperatorIds: asStringArray(row.assigned_operator_ids),
          assignedVehicleId: row.assigned_vehicle_id ?? undefined,
          status: row.status,
        });
        if (!result.success) return undefined;
        return { trip: result.data, stationTimes };
      })
      .filter(
        (
          record,
        ): record is { trip: TripTask; stationTimes: ImportTrain["stations"] } =>
          record !== undefined,
      );
  }

  async loadTripEvents(): Promise<TripEvent[]> {
    const rows = await this.safeRows<TripEventRow>(
      `select *
       from trip_events
       order by occurred_at asc`,
      [],
      "postgres.load_trip_events_failed",
    );
    return rows
      .map((row) => {
        const result = TripEventSchema.safeParse({
          id: row.id,
          tripId: row.trip_id,
          kind: row.kind,
          fromStatus: row.from_status,
          toStatus: row.to_status,
          source: row.source,
          actorOperatorId: row.actor_operator_id ?? undefined,
          occurredAt: toIso(row.occurred_at),
          payload: row.payload ?? undefined,
        });
        return result.success ? result.data : undefined;
      })
      .filter((event): event is TripEvent => event !== undefined);
  }

  private async safeQuery(
    sql: string,
    values: unknown[],
    failureEvent: string,
  ): Promise<void> {
    if (!this.pool || !this.ready) return;
    try {
      await this.pool.query(sql, values);
    } catch (error) {
      logError(failureEvent, error);
    }
  }

  private async safeRows<T>(
    sql: string,
    values: unknown[],
    failureEvent: string,
  ): Promise<T[]> {
    if (!this.pool || !this.ready) return [];
    try {
      const result = await this.pool.query(sql, values);
      return result.rows as T[];
    } catch (error) {
      logError(failureEvent, error);
      return [];
    }
  }
}

interface ImportJobRow {
  id: string;
  source_type: string;
  file_name: string;
  status: string;
  parser_name: string;
  confidence: unknown;
  confidence_score: string | number | null;
  warnings: unknown;
  errors: unknown;
  created_by: string;
  created_at: Date | string;
  updated_at: Date | string;
  storage_key: string;
}

interface ScheduleVersionRow {
  schedule_version_id: string;
  schedule_version_name: string | null;
  source_job_id: string;
  source_file_name: string;
  imported_at: Date | string;
  schedule_date: Date | string;
  accepted_sections: {
    trains?: unknown;
    segments?: unknown;
    duties?: unknown;
  };
}

interface DutyRow {
  id: string;
  schedule_version_id: string;
  source_job_id: string;
  imported_at: Date | string;
  operator_name: string | null;
  train_no: string | null;
  route_id: string | null;
  duty_date: Date | string | null;
  notes: string | null;
  data: unknown;
}

interface TripRow {
  id: string;
  train_no: string;
  route_id: string;
  direction: string;
  origin_station_id: string;
  terminal_station_id: string;
  schedule_version_id: string;
  planned_departure_at: Date | string;
  planned_arrival_at: Date | string;
  actual_departure_at: Date | string | null;
  actual_arrival_at: Date | string | null;
  assigned_operator_ids: unknown;
  assigned_vehicle_id: string | null;
  station_times: unknown;
  status: string;
}

interface TripEventRow {
  id: string;
  trip_id: string;
  kind: string;
  from_status: string;
  to_status: string;
  source: string;
  actor_operator_id: string | null;
  occurred_at: Date | string;
  payload: unknown;
}

function tripStationTimes(trip: TripTask): ImportTrain["stations"] {
  const withStationTimes = trip as TripTask & {
    stationTimes?: ImportTrain["stations"];
  };
  return withStationTimes.stationTimes ?? [];
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asStationTimes(value: unknown): ImportTrain["stations"] {
  if (!Array.isArray(value)) return [];
  const stations: ImportTrain["stations"] = [];
  value.forEach((station, index) => {
    if (!station || typeof station !== "object") return;
    const record = station as Record<string, unknown>;
    const stationName = record.stationName;
    if (typeof stationName !== "string" || stationName.length === 0) return;
    stations.push({
      stationName,
      ...(typeof record.stationCode === "string"
        ? { stationCode: record.stationCode }
        : {}),
      ...(typeof record.arrivalTime === "string"
        ? { arrivalTime: record.arrivalTime }
        : {}),
      ...(typeof record.departureTime === "string"
        ? { departureTime: record.departureTime }
        : {}),
      order:
        typeof record.order === "number" && Number.isInteger(record.order)
          ? record.order
          : index,
    });
  });
  return stations;
}

function toIso(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function toDate(value: Date | string): string {
  return toIso(value).slice(0, 10);
}
