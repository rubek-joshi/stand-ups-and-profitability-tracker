import { Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, type OrgSettings, type Prisma } from "@workspace/database";
import { AuditService } from "../audit/audit.service";
import { MailService } from "../mail/mail.service";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateSettingsDto } from "./dto/update-settings.dto";

export type OrgSettingsResponse = Omit<OrgSettings, "smtpPass"> & {
  smtpPassSet: boolean;
};

@Injectable()
export class SettingsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly auditService: AuditService,
    private readonly mailService: MailService,
  ) {}

  async get() {
    const settings = await this.prismaService.orgSettings.findFirst();
    if (!settings) {
      throw new NotFoundException("Org settings not found");
    }
    return this.toResponse(settings);
  }

  async update(dto: UpdateSettingsDto, actorId: string) {
    const current = await this.prismaService.orgSettings.findFirst();
    if (!current) {
      throw new NotFoundException("Org settings not found");
    }
    const { smtpPass, ...rest } = dto;
    const data: Prisma.OrgSettingsUpdateInput = { ...rest };
    if (smtpPass !== undefined) {
      data.smtpPass = smtpPass.trim() === "" ? null : smtpPass;
    }
    if (rest.smtpHost !== undefined) {
      data.smtpHost = rest.smtpHost?.trim() || null;
    }
    if (rest.smtpUser !== undefined) {
      data.smtpUser = rest.smtpUser?.trim() || null;
    }
    if (rest.smtpFrom !== undefined) {
      data.smtpFrom = rest.smtpFrom?.trim() || null;
    }
    const updated = await this.prismaService.orgSettings.update({
      where: { id: current.id },
      data,
    });
    await this.auditService.write({
      actorId,
      action: AuditAction.SETTINGS_UPDATED,
      targetType: "OrgSettings",
      targetId: updated.id,
      metadata: {
        before: this.toResponse(current),
        after: this.toResponse(updated),
      },
    });
    return this.toResponse(updated);
  }

  async sendTestEmail(to: string, actorId: string) {
    const settings = await this.prismaService.orgSettings.findFirst();
    await this.mailService.sendTestMail(to);
    if (settings) {
      await this.auditService.write({
        actorId,
        action: AuditAction.SETTINGS_SMTP_TESTED,
        targetType: "OrgSettings",
        targetId: settings.id,
        metadata: { to },
      });
    }
    return { ok: true };
  }

  private toResponse(settings: OrgSettings): OrgSettingsResponse {
    const { smtpPass, ...rest } = settings;
    return {
      ...rest,
      smtpPassSet: Boolean(smtpPass),
    };
  }
}
