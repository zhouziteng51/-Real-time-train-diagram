import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from "@nestjs/common";
import type {
  ConfirmImportBody,
  NormalizedImportDocument,
} from "@metro-ops/shared";
import { TripStore } from "../trip/trip.store.js";
import { ImportStore } from "./import.store.js";

@Injectable()
export class ImportDomainService {
  private readonly logger = new Logger(ImportDomainService.name);

  constructor(
    @Inject(ImportStore) private readonly store: ImportStore,
    @Inject(TripStore) private readonly trips: TripStore,
  ) {}

  async confirmAndImport(
    jobId: string,
    body: ConfirmImportBody,
  ): Promise<void> {
    const doc = this.store.getDoc(jobId);
    if (!doc) throw new Error(`parsed document not ready for job ${jobId}`);

    const job = this.store.mustFindJob(jobId);
    if (job.status === "IMPORTED") return;
    if (job.status !== "REVIEW_REQUIRED" && job.status !== "NORMALIZED") {
      throw new BadRequestException(
        "only REVIEW_REQUIRED or NORMALIZED jobs can be imported",
      );
    }

    if (job.status === "REVIEW_REQUIRED") {
      this.store.transition(jobId, { status: "NORMALIZED" });
    }

    this.upsert(jobId, doc, body);
    this.store.transition(jobId, { status: "IMPORTED" });
  }

  private upsert(
    jobId: string,
    doc: NormalizedImportDocument,
    body: ConfirmImportBody,
  ): void {
    const normalizedDoc = normalizeDocumentForImport(doc, body);
    const result = this.trips.upsertImportedDocument(
      jobId,
      normalizedDoc,
      body.acceptedSections,
      {
        preserveScheduleVersionMetadata:
          body.acceptedSections.duties &&
          !body.acceptedSections.trains &&
          !body.acceptedSections.segments,
        replaceDutyDate: body.dutyDate,
        replaceDutyShiftNames: extractShiftNames(normalizedDoc),
      },
    );
    this.logger.log(
      `imported schedule ${result.scheduleVersionId}: ${result.trains} trains, ${result.segments} segments, ${result.duties} duties, ${result.projectedTrips} trips`,
    );
  }
}

function normalizeDocumentForImport(
  doc: NormalizedImportDocument,
  body: ConfirmImportBody,
): NormalizedImportDocument {
  return {
    ...doc,
    meta: {
      ...doc.meta,
      scheduleVersionName:
        body.targetScheduleVersionName ?? doc.meta.scheduleVersionName,
    },
    dutyAssignments: doc.dutyAssignments.map((duty) => ({
      ...duty,
      ...(body.dutyDate ? { dutyDate: body.dutyDate } : {}),
      routeId: body.targetScheduleVersionName
        ? normalizeDutyRouteId(duty, body.targetScheduleVersionName)
        : duty.routeId,
    })),
  };
}

function normalizeDutyRouteId(
  duty: NormalizedImportDocument["dutyAssignments"][number],
  targetScheduleVersionName: string,
): string | undefined {
  const routeNo = duty.notes?.match(/交路号:([^；]+)/)?.[1];
  if (routeNo) return `${targetScheduleVersionName}-${routeNo}`;
  return duty.routeId;
}

function extractShiftNames(doc: NormalizedImportDocument): string[] {
  return Array.from(
    new Set(
      doc.dutyAssignments
        .map((duty) => duty.notes?.match(/班次:([^；]+)/)?.[1])
        .filter((value): value is string => Boolean(value)),
    ),
  );
}
