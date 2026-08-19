import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AuditAction, PersonStatus } from "@workspace/database";
import { AuditService } from "../audit/audit.service";
import {
  paginatedResult,
  resolvePagination,
} from "../_shared/utils/pagination.util";
import { PrismaService } from "../prisma/prisma.service";
import {
  AddEmployeeGroupMemberDto,
  AddEmployeeGroupMembersBulkDto,
  CreateEmployeeGroupDto,
  UpdateEmployeeGroupDto,
} from "./dto/employee-group.dto";

@Injectable()
export class EmployeeGroupsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(dto: CreateEmployeeGroupDto, actorId: string) {
    const name = dto.name.trim();
    const existing = await this.prismaService.employeeGroup.findUnique({
      where: { name },
    });
    if (existing) {
      throw new ConflictException(`Group "${name}" already exists`);
    }
    const group = await this.prismaService.employeeGroup.create({
      data: {
        name,
        description: dto.description?.trim() || null,
      },
      include: this.detailInclude(),
    });
    await this.auditService.write({
      actorId,
      action: AuditAction.EMPLOYEE_GROUP_CREATED,
      targetType: "EmployeeGroup",
      targetId: group.id,
      metadata: { after: this.serialize(group) },
    });
    return this.serialize(group);
  }

  async findAll(filters: { q?: string; page?: string; pageSize?: string } = {}) {
    const q = filters.q?.trim();
    const where = q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { description: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {};
    const pagination = resolvePagination({
      page: filters.page,
      pageSize: filters.pageSize,
    });
    const [groups, total] = await Promise.all([
      this.prismaService.employeeGroup.findMany({
        where,
        orderBy: { name: "asc" },
        include: {
          _count: { select: { members: true } },
        },
        ...(pagination
          ? { skip: pagination.skip, take: pagination.take }
          : {}),
      }),
      this.prismaService.employeeGroup.count({ where }),
    ]);
    return paginatedResult(
      groups.map((g) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        memberCount: g._count.members,
        createdAt: g.createdAt,
        updatedAt: g.updatedAt,
      })),
      total,
      pagination,
    );
  }

  async findOne(id: string) {
    const group = await this.getOrThrow(id);
    return this.serialize(group);
  }

  async update(id: string, dto: UpdateEmployeeGroupDto, actorId: string) {
    const before = await this.getOrThrow(id);
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      const clash = await this.prismaService.employeeGroup.findFirst({
        where: { name, NOT: { id } },
      });
      if (clash) {
        throw new ConflictException(`Group "${name}" already exists`);
      }
    }
    const group = await this.prismaService.employeeGroup.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        description:
          dto.description === undefined
            ? undefined
            : dto.description?.trim() || null,
      },
      include: this.detailInclude(),
    });
    await this.auditService.write({
      actorId,
      action: AuditAction.EMPLOYEE_GROUP_UPDATED,
      targetType: "EmployeeGroup",
      targetId: group.id,
      metadata: {
        before: this.serialize(before),
        after: this.serialize(group),
      },
    });
    return this.serialize(group);
  }

  async remove(id: string, actorId: string) {
    const before = await this.getOrThrow(id);
    const standupCount = await this.prismaService.standup.count({
      where: { employeeGroupId: id },
    });
    if (standupCount > 0) {
      throw new BadRequestException(
        "Cannot delete a group that is used by stand-ups",
      );
    }
    await this.prismaService.employeeGroup.delete({ where: { id } });
    await this.auditService.write({
      actorId,
      action: AuditAction.EMPLOYEE_GROUP_DELETED,
      targetType: "EmployeeGroup",
      targetId: id,
      metadata: { before: this.serialize(before) },
    });
    return { id };
  }

  async addMember(
    groupId: string,
    dto: AddEmployeeGroupMemberDto,
    actorId: string,
  ) {
    await this.getOrThrow(groupId);
    const employee = await this.prismaService.employee.findUnique({
      where: { id: dto.employeeId },
    });
    if (!employee) {
      throw new NotFoundException(`Employee ${dto.employeeId} not found`);
    }
    if (employee.status !== PersonStatus.active) {
      throw new BadRequestException("Only active employees can be added to a group");
    }
    const existing = await this.prismaService.employeeGroupMember.findUnique({
      where: {
        groupId_employeeId: { groupId, employeeId: dto.employeeId },
      },
    });
    if (existing) {
      throw new ConflictException("Employee is already in this group");
    }
    await this.prismaService.employeeGroupMember.create({
      data: { groupId, employeeId: dto.employeeId },
    });
    await this.auditService.write({
      actorId,
      action: AuditAction.EMPLOYEE_GROUP_MEMBER_ADDED,
      targetType: "EmployeeGroup",
      targetId: groupId,
      metadata: { employeeId: dto.employeeId },
    });
    return this.findOne(groupId);
  }

  async addMembersBulk(
    groupId: string,
    dto: AddEmployeeGroupMembersBulkDto,
    actorId: string,
  ) {
    await this.getOrThrow(groupId);
    const uniqueIds = [...new Set(dto.employeeIds.map((id) => id.trim()))].filter(
      Boolean,
    );
    if (uniqueIds.length === 0) {
      throw new BadRequestException("At least one employee is required");
    }

    const employees = await this.prismaService.employee.findMany({
      where: { id: { in: uniqueIds } },
    });
    if (employees.length !== uniqueIds.length) {
      const found = new Set(employees.map((employee) => employee.id));
      const missing = uniqueIds.filter((id) => !found.has(id));
      throw new NotFoundException(
        `Employees not found: ${missing.join(", ")}`,
      );
    }

    const inactive = employees.filter(
      (employee) => employee.status !== PersonStatus.active,
    );
    if (inactive.length > 0) {
      throw new BadRequestException(
        `Only active employees can be added: ${inactive.map((employee) => employee.name).join(", ")}`,
      );
    }

    const existing = await this.prismaService.employeeGroupMember.findMany({
      where: { groupId, employeeId: { in: uniqueIds } },
      select: { employeeId: true },
    });
    const existingIds = new Set(existing.map((member) => member.employeeId));
    const toAdd = uniqueIds.filter((id) => !existingIds.has(id));

    if (toAdd.length === 0) {
      return this.findOne(groupId);
    }

    await this.prismaService.employeeGroupMember.createMany({
      data: toAdd.map((employeeId) => ({ groupId, employeeId })),
    });

    await Promise.all(
      toAdd.map((employeeId) =>
        this.auditService.write({
          actorId,
          action: AuditAction.EMPLOYEE_GROUP_MEMBER_ADDED,
          targetType: "EmployeeGroup",
          targetId: groupId,
          metadata: { employeeId },
        }),
      ),
    );

    return this.findOne(groupId);
  }

  async removeMember(groupId: string, employeeId: string, actorId: string) {
    await this.getOrThrow(groupId);
    const existing = await this.prismaService.employeeGroupMember.findUnique({
      where: { groupId_employeeId: { groupId, employeeId } },
    });
    if (!existing) {
      throw new NotFoundException("Employee is not in this group");
    }
    await this.prismaService.employeeGroupMember.delete({
      where: { groupId_employeeId: { groupId, employeeId } },
    });
    await this.auditService.write({
      actorId,
      action: AuditAction.EMPLOYEE_GROUP_MEMBER_REMOVED,
      targetType: "EmployeeGroup",
      targetId: groupId,
      metadata: { employeeId },
    });
    return this.findOne(groupId);
  }

  private detailInclude() {
    return {
      members: {
        include: {
          employee: {
            select: {
              id: true,
              name: true,
              email: true,
              contactNumber: true,
              status: true,
            },
          },
        },
        orderBy: { employee: { name: "asc" as const } },
      },
      _count: { select: { members: true } },
    };
  }

  private async getOrThrow(id: string) {
    const group = await this.prismaService.employeeGroup.findUnique({
      where: { id },
      include: this.detailInclude(),
    });
    if (!group) {
      throw new NotFoundException(`Employee group ${id} not found`);
    }
    return group;
  }

  private serialize(
    group: Awaited<ReturnType<EmployeeGroupsService["getOrThrow"]>>,
  ) {
    return {
      id: group.id,
      name: group.name,
      description: group.description,
      memberCount: group._count.members,
      members: group.members.map((m) => ({
        employeeId: m.employeeId,
        createdAt: m.createdAt,
        employee: m.employee,
      })),
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    };
  }
}
