import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Module,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
  Inject,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { ImportJob, NormalizedImportDocument } from "@metro-ops/shared";
import { ConfirmImportBodySchema } from "@metro-ops/shared";
import { RealtimeModule } from "../realtime/realtime.module.js";
import { TripModule } from "../trip/trip.module.js";
import { ImportStore } from "./import.store.js";
import { ParserFactory, detectSourceType } from "./parsers/parser.factory.js";
import { ImportParseWorker } from "./import.worker.js";
import { ImportDomainService } from "./import.service.js";
import { ImportQueueService } from "./import-queue.service.js";
import { Roles } from "../auth/roles.decorator.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthenticatedUser } from "../auth/roles.js";

interface UploadedImportFile {
  originalname: string;
  buffer: Buffer;
}

@Controller("api/imports")
export class ImportController {
  constructor(
    @Inject(ImportStore) private readonly store: ImportStore,
    @Inject(ImportQueueService) private readonly queue: ImportQueueService,
    @Inject(ImportDomainService) private readonly domain: ImportDomainService,
  ) {}

  @Post()
  @Roles("DISPATCHER")
  @HttpCode(201)
  @UseInterceptors(FileInterceptor("file"))
  async upload(
    @UploadedFile() file: UploadedImportFile | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ImportJob> {
    if (!file) throw new BadRequestException("file is required");
    const fileName = normalizeUploadedFileName(file.originalname);
    const sourceType = detectSourceType(fileName);
    const job = this.store.createJob({
      fileName,
      sourceType,
      createdBy: user.id,
      buffer: file.buffer,
    });
    this.queue.enqueue(job.id);
    return job;
  }

  @Get()
  @Roles("DISPATCHER")
  list(): ImportJob[] {
    return this.store.list();
  }

  @Get(":jobId")
  @Roles("DISPATCHER")
  get(@Param("jobId") jobId: string): ImportJob {
    return this.store.mustFindJob(jobId);
  }

  @Get(":jobId/preview")
  @Roles("DISPATCHER")
  async preview(@Param("jobId") jobId: string): Promise<NormalizedImportDocument> {
    const doc = await this.store.getDoc(jobId);
    if (!doc) throw new BadRequestException("preview not ready yet");
    return doc;
  }

  @Post(":jobId/reparse")
  @Roles("DISPATCHER")
  @HttpCode(202)
  async reparse(@Param("jobId") jobId: string): Promise<{ status: string }> {
    const current = this.store.mustFindJob(jobId);
    if (current.status !== "REVIEW_REQUIRED" && current.status !== "FAILED") {
      throw new BadRequestException(
        "only REVIEW_REQUIRED or FAILED jobs can be reparsed",
      );
    }
    this.queue.enqueue(jobId);
    return { status: "QUEUED" };
  }

  @Post(":jobId/confirm")
  @Roles("ADMIN")
  @HttpCode(200)
  async confirm(
    @Param("jobId") jobId: string,
    @Body() body: unknown,
  ): Promise<ImportJob> {
    const parsed = ConfirmImportBodySchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    await this.domain.confirmAndImport(jobId, parsed.data);
    return this.store.mustFindJob(jobId);
  }

}

function normalizeUploadedFileName(fileName: string): string {
  if (!/[ÃÂæäåéçè]/.test(fileName)) return fileName;
  return Buffer.from(fileName, "latin1").toString("utf8");
}

@Module({
  imports: [RealtimeModule, TripModule],
  controllers: [ImportController],
  providers: [
    ImportStore,
    ParserFactory,
    ImportParseWorker,
    ImportQueueService,
    ImportDomainService,
  ],
  exports: [ImportStore],
})
export class ImportModule {}
