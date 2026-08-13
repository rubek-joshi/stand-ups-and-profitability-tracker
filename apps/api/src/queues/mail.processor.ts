import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { MailService, SendMailPayload } from "../mail/mail.service";
import { MAIL_QUEUE } from "./queue.constants";

@Processor(MAIL_QUEUE)
export class MailProcessor extends WorkerHost {
  private readonly logger = new Logger(MailProcessor.name);

  constructor(private readonly mailService: MailService) {
    super();
  }

  async process(job: Job<SendMailPayload>): Promise<void> {
    this.logger.log(`Processing mail job ${job.id}`);
    await this.mailService.sendMail(job.data);
  }
}
