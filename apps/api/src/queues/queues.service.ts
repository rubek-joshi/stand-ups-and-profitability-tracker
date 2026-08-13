import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import { Queue } from "bullmq";
import { SendMailPayload } from "../mail/mail.service";
import { MAIL_QUEUE } from "./queue.constants";

@Injectable()
export class QueuesService {
  constructor(@InjectQueue(MAIL_QUEUE) private readonly mailQueue: Queue) {}

  async enqueueMail(payload: SendMailPayload): Promise<string | undefined> {
    const job = await this.mailQueue.add("send-mail", payload, {
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: true,
    });
    return job.id;
  }
}
