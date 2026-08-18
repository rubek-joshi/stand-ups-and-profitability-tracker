import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AuditAction, PersonStatus } from "@workspace/database";
import { AuditService } from "../audit/audit.service";
import { parseIsoDate } from "../_shared/utils/date.util";
import { nprToPaisa } from "../_shared/utils/money.util";
import {
  serializeMoneyFields,
  serializeMoneyList,
} from "../_shared/utils/serialize-money.util";
import { PrismaService } from "../prisma/prisma.service";
import { QueuesService } from "../queues/queues.service";
import {
  CreateCoreMemberDto,
  CreateCoreMemberSalaryDto,
  MarkCoreMemberLeftDto,
  UpdateCoreMemberDto,
  UpdateCoreMemberSalaryDto,
} from "./dto/core-member.dto";

const SALARY_FIELDS = ["salaryPaisa"] as const;

@Injectable()
export class CoreMembersService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly auditService: AuditService,
    private readonly queuesService: QueuesService,
  ) {}

  async create(dto: CreateCoreMemberDto, actorId: string) {
    const coreMember = await this.prismaService.coreMember.create({
      data: {
        name: dto.name,
        email: dto.email,
        contactNumber: dto.contactNumber?.trim() || null,
        dateJoined: parseIsoDate(dto.dateJoined),
        ...(dto.initialSalaryNpr !== undefined
          ? {
              salaryEntries: {
                create: {
                  salaryPaisa: nprToPaisa(dto.initialSalaryNpr),
                  effectiveDate: parseIsoDate(dto.dateJoined),
                  changedById: actorId,
                  reason: "Initial salary",
                },
              },
            }
          : {}),
      },
      include: { salaryEntries: true },
    });
    await this.auditService.write({
      actorId,
      action: AuditAction.CORE_MEMBER_CREATED,
      targetType: "CoreMember",
      targetId: coreMember.id,
      metadata: { after: this.serialize(coreMember) },
    });
    if (dto.initialSalaryNpr !== undefined) {
      await this.queuesService.enqueueRecalculate({
        reason: "core_member_salary_created",
        coreMemberId: coreMember.id,
      });
    }
    return this.serialize(coreMember);
  }

  async findAll() {
    const members = await this.prismaService.coreMember.findMany({
      orderBy: { name: "asc" },
      include: {
        salaryEntries: { orderBy: { effectiveDate: "desc" }, take: 1 },
      },
    });
    return members.map((member) => this.serialize(member));
  }

  async findOne(id: string) {
    const coreMember = await this.prismaService.coreMember.findUnique({
      where: { id },
      include: {
        salaryEntries: { orderBy: { effectiveDate: "desc" } },
        assignments: { include: { project: true } },
      },
    });
    if (!coreMember) {
      throw new NotFoundException(`Core member ${id} not found`);
    }
    return {
      ...this.serialize(coreMember),
      salaryEntries: serializeMoneyList(coreMember.salaryEntries, SALARY_FIELDS),
    };
  }

  async update(id: string, dto: UpdateCoreMemberDto, actorId: string) {
    await this.getOrThrow(id);
    const coreMember = await this.prismaService.coreMember.update({
      where: { id },
      data: {
        name: dto.name,
        email: dto.email,
        ...(dto.contactNumber !== undefined
          ? { contactNumber: dto.contactNumber?.trim() || null }
          : {}),
        dateJoined: dto.dateJoined
          ? parseIsoDate(dto.dateJoined)
          : undefined,
      },
      include: { salaryEntries: true },
    });
    await this.auditService.write({
      actorId,
      action: AuditAction.CORE_MEMBER_UPDATED,
      targetType: "CoreMember",
      targetId: coreMember.id,
      metadata: { after: this.serialize(coreMember) },
    });
    return this.serialize(coreMember);
  }

  async markLeft(id: string, dto: MarkCoreMemberLeftDto, actorId: string) {
    await this.getOrThrow(id);
    const coreMember = await this.prismaService.coreMember.update({
      where: { id },
      data: {
        status: PersonStatus.left,
        dateLeft: parseIsoDate(dto.dateLeft),
      },
    });
    await this.auditService.write({
      actorId,
      action: AuditAction.CORE_MEMBER_MARKED_LEFT,
      targetType: "CoreMember",
      targetId: coreMember.id,
      metadata: { after: coreMember },
    });
    return coreMember;
  }

  async remove(id: string, actorId: string) {
    const coreMember = await this.getOrThrow(id);
    const [assignments, salaryEntries] = await Promise.all([
      this.prismaService.coreMemberAssignment.count({
        where: { coreMemberId: id },
      }),
      this.prismaService.coreMemberSalaryEntry.count({
        where: { coreMemberId: id },
      }),
    ]);
    if (assignments > 0 || salaryEntries > 0) {
      throw new BadRequestException(
        "Cannot delete core member with assignments or salary entries. Mark as left instead.",
      );
    }
    await this.prismaService.coreMember.delete({ where: { id } });
    await this.auditService.write({
      actorId,
      action: AuditAction.CORE_MEMBER_DELETED,
      targetType: "CoreMember",
      targetId: id,
      metadata: { before: coreMember },
    });
    return { id };
  }

  async createSalaryEntry(
    coreMemberId: string,
    dto: CreateCoreMemberSalaryDto,
    actorId: string,
  ) {
    await this.getOrThrow(coreMemberId);
    const entry = await this.prismaService.coreMemberSalaryEntry.create({
      data: {
        coreMemberId,
        salaryPaisa: nprToPaisa(dto.salaryNpr),
        effectiveDate: parseIsoDate(dto.effectiveDate),
        changedById: actorId,
        reason: dto.reason,
      },
    });
    await this.auditService.write({
      actorId,
      action: AuditAction.CORE_MEMBER_SALARY_CREATED,
      targetType: "CoreMemberSalaryEntry",
      targetId: entry.id,
      metadata: { after: serializeMoneyFields(entry, SALARY_FIELDS) },
    });
    await this.queuesService.enqueueRecalculate({
      reason: "core_member_salary_created",
      coreMemberId,
      salaryEntryId: entry.id,
    });
    return serializeMoneyFields(entry, SALARY_FIELDS);
  }

  async updateSalaryEntry(
    coreMemberId: string,
    entryId: string,
    dto: UpdateCoreMemberSalaryDto,
    actorId: string,
  ) {
    const before = await this.getSalaryOrThrow(coreMemberId, entryId);
    const entry = await this.prismaService.coreMemberSalaryEntry.update({
      where: { id: entryId },
      data: {
        salaryPaisa:
          dto.salaryNpr === undefined ? undefined : nprToPaisa(dto.salaryNpr),
        effectiveDate: dto.effectiveDate
          ? parseIsoDate(dto.effectiveDate)
          : undefined,
        reason: dto.reason,
        changedById: actorId,
      },
    });
    await this.auditService.write({
      actorId,
      action: AuditAction.CORE_MEMBER_SALARY_UPDATED,
      targetType: "CoreMemberSalaryEntry",
      targetId: entry.id,
      metadata: {
        before: serializeMoneyFields(before, SALARY_FIELDS),
        after: serializeMoneyFields(entry, SALARY_FIELDS),
      },
    });
    await this.queuesService.enqueueRecalculate({
      reason: "core_member_salary_updated",
      coreMemberId,
      salaryEntryId: entry.id,
    });
    return serializeMoneyFields(entry, SALARY_FIELDS);
  }

  async deleteSalaryEntry(
    coreMemberId: string,
    entryId: string,
    actorId: string,
  ) {
    const before = await this.getSalaryOrThrow(coreMemberId, entryId);
    await this.prismaService.coreMemberSalaryEntry.delete({
      where: { id: entryId },
    });
    await this.auditService.write({
      actorId,
      action: AuditAction.CORE_MEMBER_SALARY_DELETED,
      targetType: "CoreMemberSalaryEntry",
      targetId: entryId,
      metadata: { before: serializeMoneyFields(before, SALARY_FIELDS) },
    });
    await this.queuesService.enqueueRecalculate({
      reason: "core_member_salary_deleted",
      coreMemberId,
      salaryEntryId: entryId,
    });
    return { id: entryId };
  }

  private async getOrThrow(id: string) {
    const coreMember = await this.prismaService.coreMember.findUnique({
      where: { id },
    });
    if (!coreMember) {
      throw new NotFoundException(`Core member ${id} not found`);
    }
    return coreMember;
  }

  private async getSalaryOrThrow(coreMemberId: string, entryId: string) {
    const entry = await this.prismaService.coreMemberSalaryEntry.findFirst({
      where: { id: entryId, coreMemberId },
    });
    if (!entry) {
      throw new NotFoundException(`Salary entry ${entryId} not found`);
    }
    return entry;
  }

  private serialize<
    T extends { salaryEntries?: Array<{ salaryPaisa: bigint }> },
  >(coreMember: T) {
    if (!coreMember.salaryEntries) {
      return coreMember;
    }
    return {
      ...coreMember,
      salaryEntries: serializeMoneyList(coreMember.salaryEntries, SALARY_FIELDS),
    };
  }
}
