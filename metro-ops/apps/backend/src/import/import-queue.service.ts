import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Queue, Worker } from "bullmq";
import { logError, logger } from "../observability/structured-logger.js";
import { ImportParseWorker } from "./import.worker.js";

interface ImportParseJob {
  jobId: string;
}

@Injectable()
export class ImportQueueService implements OnModuleInit, OnModuleDestroy {
  private queue: Queue<ImportParseJob> | undefined;
  private worker: Worker<ImportParseJob> | undefined;

  constructor(
    @Inject(ImportParseWorker)
    private readonly parseWorker: ImportParseWorker,
  ) {}

  onModuleInit(): void {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      logger.info({ event: "import_queue.inline" }, "import queue inline mode");
      return;
    }

    const connection = { url: redisUrl };
    this.queue = new Queue<ImportParseJob>("import-parse", { connection });
    this.worker = new Worker<ImportParseJob>(
      "import-parse",
      async (job) => {
        await this.parseWorker.handle(job.data.jobId);
      },
      { connection },
    );
    this.worker.on("failed", (job, error) => {
      logError("import_queue.job_failed", error, { jobId: job?.data.jobId });
    });
    this.worker.on("error", (error) => {
      logError("import_queue.worker_error", error);
    });
    this.queue.on("error", (error) => {
      logError("import_queue.queue_error", error);
    });
    logger.info({ event: "import_queue.redis" }, "import queue redis mode");
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }

  enqueue(jobId: string): void {
    if (this.queue) {
      this.queue
        .add("parse", { jobId }, { attempts: 2, removeOnComplete: 100 })
        .catch((error) => {
          logError("import_queue.enqueue_failed", error, { jobId });
          this.enqueueInline(jobId);
        });
      return;
    }
    this.enqueueInline(jobId);
  }

  private enqueueInline(jobId: string): void {
    queueMicrotask(() => {
      this.parseWorker.handle(jobId).catch((error) => {
        logError("import_queue.inline_failed", error, { jobId });
      });
    });
  }
}
