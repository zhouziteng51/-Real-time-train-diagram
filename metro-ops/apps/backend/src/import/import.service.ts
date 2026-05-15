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
import { RuntimeScheduleService } from "../schedule/runtime-schedule.service.js";
import { TripStore } from "../trip/trip.store.js";
import { ImportStore } from "./import.store.js";

@Injectable()
export class ImportDomainService {
  private readonly logger = new Logger(ImportDomainService.name);

  constructor(
    @Inject(ImportStore) private readonly store: ImportStore,
    @Inject(TripStore) private readonly trips: TripStore,
    @Inject(RuntimeScheduleService)
    private readonly runtimeSchedule: RuntimeScheduleService,
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
    const result = this.trips.upsertImportedDocument(
      jobId,
      doc,
      body.acceptedSections,
    );
    if (body.acceptedSections.trains) {
      this.runtimeSchedule.upsertImportedDocument(doc);
    }
    this.logger.log(
      `imported schedule ${result.scheduleVersionId}: ${result.trains} trains, ${result.segments} segments, ${result.duties} duties, ${result.projectedTrips} trips`,
    );
  }
}
