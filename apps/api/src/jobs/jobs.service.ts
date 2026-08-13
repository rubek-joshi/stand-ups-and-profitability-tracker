import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import {
  AmcStatus,
  AuditAction,
  ProjectStatus,
} from "@workspace/database";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { QueuesService } from "../queues/queues.service";

const AUTO_EXTEND_REASON =
  "Automatically extended — project was not closed by its end date";

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly auditService: AuditService,
    private readonly queuesService: QueuesService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async runHourlyMaintenance(): Promise<void> {
    await this.autoExtendProjects();
    await this.refreshAmcStatusesAndRemind();
  }

  async autoExtendProjects(): Promise<void> {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const due = await this.prismaService.project.findMany({
      where: {
        status: ProjectStatus.active,
        endDate: { lt: today },
        autoExtended: false,
      },
    });
    if (due.length === 0) {
      return;
    }
    const admins = await this.prismaService.user.findMany({
      where: { isActive: true },
    });
    for (const project of due) {
      const systemUser = admins[0];
      if (!systemUser) {
        this.logger.warn("No user available to attribute auto-extension");
        continue;
      }
      await this.prismaService.$transaction(async (tx) => {
        await tx.project.update({
          where: { id: project.id },
          data: {
            status: ProjectStatus.extended,
            autoExtended: true,
          },
        });
        await tx.projectExtension.create({
          data: {
            projectId: project.id,
            reason: AUTO_EXTEND_REASON,
            amountPaisa: 0n,
            isProfit: false,
            isAuto: true,
            createdById: systemUser.id,
          },
        });
      });
      await this.auditService.write({
        actorId: systemUser.id,
        action: AuditAction.PROJECT_AUTO_EXTENDED,
        targetType: "Project",
        targetId: project.id,
        metadata: { reason: AUTO_EXTEND_REASON },
      });
      for (const admin of admins) {
        await this.queuesService.enqueueMail({
          to: admin.email,
          subject: `Project auto-extended: ${project.name}`,
          text: `Project "${project.name}" was not closed by its end date and was automatically extended.`,
        });
      }
      this.logger.log(`Auto-extended project ${project.id}`);
    }
  }

  async refreshAmcStatusesAndRemind(): Promise<void> {
    const settings = await this.prismaService.orgSettings.findFirst();
    const leadDays = settings?.amcReminderLeadDays ?? 7;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const records = await this.prismaService.amcRecord.findMany({
      where: {
        status: {
          in: [AmcStatus.free_period, AmcStatus.reminder_due, AmcStatus.overdue],
        },
      },
      include: { project: true },
    });
    const admins = await this.prismaService.user.findMany({
      where: { isActive: true },
    });
    for (const record of records) {
      const freeUntil = new Date(record.freeUntilDate);
      freeUntil.setUTCHours(0, 0, 0, 0);
      const reminderStart = new Date(freeUntil);
      reminderStart.setUTCDate(reminderStart.getUTCDate() - leadDays);
      let nextStatus = record.status;
      if (today > freeUntil) {
        nextStatus = AmcStatus.overdue;
      } else if (today >= reminderStart) {
        nextStatus = AmcStatus.reminder_due;
      } else {
        nextStatus = AmcStatus.free_period;
      }
      if (nextStatus !== record.status) {
        await this.prismaService.amcRecord.update({
          where: { id: record.id },
          data: { status: nextStatus },
        });
      }
      const shouldEmail =
        (nextStatus === AmcStatus.reminder_due ||
          nextStatus === AmcStatus.overdue) &&
        (!record.reminderSentAt ||
          nextStatus === AmcStatus.overdue);
      if (shouldEmail && !record.reminderSentAt) {
        for (const admin of admins) {
          await this.queuesService.enqueueMail({
            to: admin.email,
            subject: `AMC ${nextStatus}: ${record.project.name}`,
            text: `AMC for project "${record.project.name}" is ${nextStatus}. Free until ${freeUntil.toISOString().slice(0, 10)}.`,
          });
        }
        await this.prismaService.amcRecord.update({
          where: { id: record.id },
          data: { reminderSentAt: new Date() },
        });
        this.logger.log(`AMC reminder sent for ${record.id}`);
      }
    }
  }
}
