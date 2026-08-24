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
import {
  paginatedResult,
  resolvePagination,
} from "../_shared/utils/pagination.util";
import { PrismaService } from "../prisma/prisma.service";
import { QueuesService } from "../queues/queues.service";
import {
  CreateEmployeeDto,
  CreateSalaryEntryDto,
  MarkLeftDto,
  UpdateEmployeeDto,
  UpdateSalaryEntryDto,
} from "./dto/employee.dto";

const SALARY_FIELDS = ["salaryPaisa"] as const;

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly auditService: AuditService,
    private readonly queuesService: QueuesService,
  ) {}

  async create(dto: CreateEmployeeDto, actorId: string) {
    const employee = await this.prismaService.employee.create({
      data: {
        name: dto.name,
        email: dto.email,
        contactNumber: dto.contactNumber?.trim() || null,
        dateJoined: parseIsoDate(dto.dateJoined),
        ...(dto.dateOfBirth
          ? { dateOfBirth: parseIsoDate(dto.dateOfBirth) }
          : {}),
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
      action: AuditAction.EMPLOYEE_CREATED,
      targetType: "Employee",
      targetId: employee.id,
      metadata: { after: this.serializeEmployee(employee) },
    });
    if (dto.initialSalaryNpr !== undefined) {
      await this.queuesService.enqueueRecalculate({
        reason: "employee_salary_created",
        employeeId: employee.id,
      });
    }
    return this.serializeEmployee(employee);
  }

  async findAll(filters: { q?: string; page?: string; pageSize?: string } = {}) {
    const q = filters.q?.trim();
    const where = q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
            { contactNumber: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {};
    const pagination = resolvePagination({
      page: filters.page,
      pageSize: filters.pageSize,
    });
    const [employees, total] = await Promise.all([
      this.prismaService.employee.findMany({
        where,
        orderBy: { name: "asc" },
        include: {
          salaryEntries: { orderBy: { effectiveDate: "desc" }, take: 1 },
          groupMemberships: {
            include: { group: { select: { id: true, name: true } } },
            orderBy: { group: { name: "asc" } },
          },
        },
        ...(pagination
          ? { skip: pagination.skip, take: pagination.take }
          : {}),
      }),
      this.prismaService.employee.count({ where }),
    ]);
    return paginatedResult(
      employees.map((employee) => {
        const serialized = this.serializeEmployee(employee);
        return {
          ...serialized,
          groups: employee.groupMemberships.map((m) => m.group),
        };
      }),
      total,
      pagination,
    );
  }

  async findOne(id: string) {
    const employee = await this.prismaService.employee.findUnique({
      where: { id },
      include: {
        salaryEntries: { orderBy: { effectiveDate: "desc" } },
        assignments: {
          include: { project: { select: { id: true, name: true, status: true } } },
          orderBy: { assignedAt: "desc" },
        },
        attendanceRecords: { orderBy: { date: "desc" } },
        standupEntries: {
          include: {
            standup: { select: { id: true, date: true } },
            allocations: {
              include: {
                project: { select: { id: true, name: true, status: true } },
                tasks: { orderBy: { sortOrder: "asc" } },
              },
            },
          },
          orderBy: { standup: { date: "desc" } },
        },
        groupMemberships: {
          include: {
            group: { select: { id: true, name: true } },
          },
          orderBy: { group: { name: "asc" } },
        },
      },
    });
    if (!employee) {
      throw new NotFoundException(`Employee ${id} not found`);
    }
    const attendanceSummary = {
      firstHalfLeave: employee.attendanceRecords.filter(
        (r) => r.type === "first_half_leave",
      ).length,
      secondHalfLeave: employee.attendanceRecords.filter(
        (r) => r.type === "second_half_leave",
      ).length,
      late: employee.attendanceRecords.filter((r) => r.type === "late").length,
      paidAbsence: employee.attendanceRecords.filter(
        (r) => r.type === "paid_absence",
      ).length,
      unpaidAbsence: employee.attendanceRecords.filter(
        (r) => r.type === "unpaid_absence",
      ).length,
    };
    return {
      ...this.serializeEmployee(employee),
      salaryEntries: serializeMoneyList(employee.salaryEntries, SALARY_FIELDS),
      assignments: employee.assignments,
      attendanceRecords: employee.attendanceRecords,
      standupEntries: employee.standupEntries,
      groups: employee.groupMemberships.map((m) => m.group),
      attendanceSummary,
    };
  }

  async update(id: string, dto: UpdateEmployeeDto, actorId: string) {
    await this.getOrThrow(id);
    const employee = await this.prismaService.employee.update({
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
        dateOfBirth:
          dto.dateOfBirth === undefined
            ? undefined
            : dto.dateOfBirth
              ? parseIsoDate(dto.dateOfBirth)
              : null,
      },
      include: { salaryEntries: true },
    });
    await this.auditService.write({
      actorId,
      action: AuditAction.EMPLOYEE_UPDATED,
      targetType: "Employee",
      targetId: employee.id,
      metadata: { after: this.serializeEmployee(employee) },
    });
    return this.serializeEmployee(employee);
  }

  async markLeft(id: string, dto: MarkLeftDto, actorId: string) {
    await this.getOrThrow(id);
    const employee = await this.prismaService.employee.update({
      where: { id },
      data: {
        status: PersonStatus.left,
        dateLeft: parseIsoDate(dto.dateLeft),
      },
    });
    await this.auditService.write({
      actorId,
      action: AuditAction.EMPLOYEE_MARKED_LEFT,
      targetType: "Employee",
      targetId: employee.id,
      metadata: { after: employee },
    });
    return employee;
  }

  async remove(id: string, actorId: string) {
    const employee = await this.getOrThrow(id);
    const [assignments, standupEntries, salaryEntries] = await Promise.all([
      this.prismaService.projectAssignment.count({ where: { employeeId: id } }),
      this.prismaService.standupEntry.count({ where: { employeeId: id } }),
      this.prismaService.employeeSalaryEntry.count({
        where: { employeeId: id },
      }),
    ]);
    if (assignments > 0 || standupEntries > 0 || salaryEntries > 0) {
      throw new BadRequestException(
        "Cannot delete employee with assignments, standup entries, or salary entries. Mark as left instead.",
      );
    }
    await this.prismaService.employee.delete({ where: { id } });
    await this.auditService.write({
      actorId,
      action: AuditAction.EMPLOYEE_DELETED,
      targetType: "Employee",
      targetId: id,
      metadata: { before: employee },
    });
    return { id };
  }

  async createSalaryEntry(
    employeeId: string,
    dto: CreateSalaryEntryDto,
    actorId: string,
  ) {
    await this.getOrThrow(employeeId);
    const entry = await this.prismaService.employeeSalaryEntry.create({
      data: {
        employeeId,
        salaryPaisa: nprToPaisa(dto.salaryNpr),
        effectiveDate: parseIsoDate(dto.effectiveDate),
        changedById: actorId,
        reason: dto.reason,
      },
    });
    await this.auditService.write({
      actorId,
      action: AuditAction.EMPLOYEE_SALARY_CREATED,
      targetType: "EmployeeSalaryEntry",
      targetId: entry.id,
      metadata: { after: serializeMoneyFields(entry, SALARY_FIELDS) },
    });
    await this.queuesService.enqueueRecalculate({
      reason: "employee_salary_created",
      employeeId,
      salaryEntryId: entry.id,
    });
    return serializeMoneyFields(entry, SALARY_FIELDS);
  }

  async updateSalaryEntry(
    employeeId: string,
    entryId: string,
    dto: UpdateSalaryEntryDto,
    actorId: string,
  ) {
    const before = await this.getSalaryOrThrow(employeeId, entryId);
    const entry = await this.prismaService.employeeSalaryEntry.update({
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
      action: AuditAction.EMPLOYEE_SALARY_UPDATED,
      targetType: "EmployeeSalaryEntry",
      targetId: entry.id,
      metadata: {
        before: serializeMoneyFields(before, SALARY_FIELDS),
        after: serializeMoneyFields(entry, SALARY_FIELDS),
      },
    });
    await this.queuesService.enqueueRecalculate({
      reason: "employee_salary_updated",
      employeeId,
      salaryEntryId: entry.id,
    });
    return serializeMoneyFields(entry, SALARY_FIELDS);
  }

  async deleteSalaryEntry(
    employeeId: string,
    entryId: string,
    actorId: string,
  ) {
    const before = await this.getSalaryOrThrow(employeeId, entryId);
    await this.prismaService.employeeSalaryEntry.delete({
      where: { id: entryId },
    });
    await this.auditService.write({
      actorId,
      action: AuditAction.EMPLOYEE_SALARY_DELETED,
      targetType: "EmployeeSalaryEntry",
      targetId: entryId,
      metadata: { before: serializeMoneyFields(before, SALARY_FIELDS) },
    });
    await this.queuesService.enqueueRecalculate({
      reason: "employee_salary_deleted",
      employeeId,
      salaryEntryId: entryId,
    });
    return { id: entryId };
  }

  private async getOrThrow(id: string) {
    const employee = await this.prismaService.employee.findUnique({
      where: { id },
    });
    if (!employee) {
      throw new NotFoundException(`Employee ${id} not found`);
    }
    return employee;
  }

  private async getSalaryOrThrow(employeeId: string, entryId: string) {
    const entry = await this.prismaService.employeeSalaryEntry.findFirst({
      where: { id: entryId, employeeId },
    });
    if (!entry) {
      throw new NotFoundException(`Salary entry ${entryId} not found`);
    }
    return entry;
  }

  private serializeEmployee<
    T extends { salaryEntries?: Array<{ salaryPaisa: bigint }> },
  >(employee: T) {
    if (!employee.salaryEntries) {
      return employee;
    }
    return {
      ...employee,
      salaryEntries: serializeMoneyList(employee.salaryEntries, SALARY_FIELDS),
    };
  }
}
