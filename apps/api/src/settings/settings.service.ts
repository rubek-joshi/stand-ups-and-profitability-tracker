import { Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction } from "@workspace/database";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateSettingsDto } from "./dto/update-settings.dto";

@Injectable()
export class SettingsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async get() {
    const settings = await this.prismaService.orgSettings.findFirst();
    if (!settings) {
      throw new NotFoundException("Org settings not found");
    }
    return settings;
  }

  async update(dto: UpdateSettingsDto, actorId: string) {
    const current = await this.get();
    const updated = await this.prismaService.orgSettings.update({
      where: { id: current.id },
      data: dto,
    });
    await this.auditService.write({
      actorId,
      action: AuditAction.SETTINGS_UPDATED,
      targetType: "OrgSettings",
      targetId: updated.id,
      metadata: { before: current, after: updated },
    });
    return updated;
  }
}
