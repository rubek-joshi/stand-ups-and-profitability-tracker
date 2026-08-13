import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { ProfitabilityService } from "../profitability/profitability.service";
import {
  RECALCULATE_QUEUE,
  RecalculateJobPayload,
} from "./queue.constants";

@Processor(RECALCULATE_QUEUE)
export class RecalculateProcessor extends WorkerHost {
  private readonly logger = new Logger(RecalculateProcessor.name);

  constructor(private readonly profitabilityService: ProfitabilityService) {
    super();
  }

  async process(job: Job<RecalculateJobPayload>): Promise<void> {
    this.logger.log(
      `Recalculate job ${job.id}: ${job.data.reason} (${JSON.stringify(job.data)})`,
    );
    this.profitabilityService.clearCache(job.data.projectId);
  }
}
