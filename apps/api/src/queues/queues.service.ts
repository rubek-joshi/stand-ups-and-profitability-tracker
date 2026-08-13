import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import { Queue } from "bullmq";
import { SendMailPayload } from "../mail/mail.service";
import {
  MAIL_QUEUE,
  RECALCULATE_QUEUE,
  RecalculateJobPayload,
} from "./queue.constants";

@Injectable()
export class QueuesService {
  constructor(
    @InjectQueue(MAIL_QUEUE) private readonly mailQueue: Queue,
    @InjectQueue(RECALCULATE_QUEUE)
    private readonly recalculateQueue: Queue,
  ) {}

  async enqueueMail(payload: SendMailPayload): Promise<string | undefined> {
    const job = await this.mailQueue.add("send-mail", payload, {
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: true,
    });
    return job.id;
  }

  async enqueueRecalculate(
    payload: RecalculateJobPayload,
  ): Promise<string | undefined> {
    const job = await this.recalculateQueue.add("recalculate", payload, {
      attempts: 2,
      removeOnComplete: true,
    });
    return job.id;
  }
}
