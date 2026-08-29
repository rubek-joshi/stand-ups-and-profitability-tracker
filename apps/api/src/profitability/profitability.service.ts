import { Injectable, NotFoundException } from "@nestjs/common";
import { AttendanceStatus, InvoiceStatus } from "@workspace/database";
import { dayBefore, daysInMonth, toIsoDate } from "../_shared/utils/date.util";
import { PrismaService } from "../prisma/prisma.service";

export type ProjectProfitability = {
  projectId: string;
  budgetPaisa: bigint;
  extensionsPaisa: bigint;
  contractedRevenuePaisa: bigint;
  realizedRevenuePaisa: bigint;
  revenuePaisa: bigint;
  employeeCostPaisa: bigint;
  coreMemberCostPaisa: bigint;
  totalCostPaisa: bigint;
  profitLossPaisa: bigint;
  marginPercent: number;
  contractedProfitLossPaisa: bigint;
  contractedMarginPercent: number;
  forecastProfitLossPaisa: bigint | null;
  isTrendingOverBudget: boolean;
};

export type ProjectLaborSeriesPoint = {
  date: string;
  laborCostPaisa: bigint;
  allocationPercentTotal: number;
  standupCount: number;
  employeeCount: number;
};

export type ProjectLaborSummary = {
  totalLaborCostPaisa: bigint;
  completedStandupCount: number;
  employeeCount: number;
  allocationPercentTotal: number;
  daily: ProjectLaborSeriesPoint[];
};

@Injectable()
export class ProfitabilityService {
  private readonly cache = new Map<string, ProjectProfitability>();

  constructor(private readonly prismaService: PrismaService) {}

  clearCache(projectId?: string): void {
    if (projectId) {
      this.cache.delete(projectId);
      return;
    }
    this.cache.clear();
  }

  async calculateProjectProfitLoss(
    projectId: string,
    options?: { from?: Date; to?: Date; useCache?: boolean },
  ): Promise<ProjectProfitability> {
    const useCache = options?.useCache !== false && !options?.from && !options?.to;
    if (useCache) {
      const cached = this.cache.get(projectId);
      if (cached) {
        return cached;
      }
    }
    const [project, orgSettings] = await Promise.all([
      this.prismaService.project.findUnique({
        where: { id: projectId },
        include: {
          extensions: true,
          invoices: {
            where: { status: InvoiceStatus.paid },
          },
          employeeAssignments: {
            include: {
              employee: { include: { salaryEntries: true } },
            },
          },
          allocations: {
            include: {
              standupEntry: {
                include: { standup: true, employee: { include: { salaryEntries: true } } },
              },
            },
          },
          coreMemberAssignments: {
            include: {
              coreMember: { include: { salaryEntries: true } },
            },
          },
        },
      }),
      this.prismaService.orgSettings.findFirst(),
    ]);

    if (!project) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }

    const extensionsPaisa = project.extensions.reduce(
      (sum, extension) => sum + extension.amountPaisa,
      0n,
    );

    const paidInvoices = project.invoices.filter((inv) => {
      const invDate = inv.paymentDate ?? inv.invoiceDate;
      if (options?.from && invDate < options.from) {
        return false;
      }
      if (options?.to && invDate > options.to) {
        return false;
      }
      return true;
    });

    const realizedRevenuePaisa = paidInvoices.reduce(
      (sum, inv) => sum + inv.amountPaisa,
      0n,
    );

    const contractedRevenuePaisa = project.budgetPaisa + extensionsPaisa;

    const cutoverDate = orgSettings?.standupTrackingStartDate ?? null;
    let employeeCostPaisa = 0n;

    if (cutoverDate) {
      const assignmentCost = (
        await this.calculateEmployeeCostFromAssignments(
          project.employeeAssignments,
          project.startDate,
          options?.from,
          this.minDate(options?.to ?? new Date(), dayBefore(cutoverDate)),
        )
      ).totalCostPaisa;

      const standupFrom = options?.from
        ? this.maxDate(options.from, cutoverDate)
        : cutoverDate;
      const standupCost = await this.calculateEmployeeCost(
        project.allocations,
        standupFrom,
        options?.to,
      );

      employeeCostPaisa = assignmentCost + standupCost;
    } else {
      if (project.allocations.length === 0) {
        employeeCostPaisa = (
          await this.calculateEmployeeCostFromAssignments(
            project.employeeAssignments,
            project.startDate,
            options?.from,
            options?.to,
          )
        ).totalCostPaisa;
      } else {
        employeeCostPaisa = await this.calculateEmployeeCost(
          project.allocations,
          options?.from,
          options?.to,
        );
      }
    }

    const coreMemberCostPaisa = await this.calculateCoreMemberCost(
      project.coreMemberAssignments,
      project.startDate,
      options?.from,
      options?.to,
    );
    const revenuePaisa = realizedRevenuePaisa;
    const totalCostPaisa = employeeCostPaisa + coreMemberCostPaisa;
    const profitLossPaisa = realizedRevenuePaisa - totalCostPaisa;
    const marginPercent =
      realizedRevenuePaisa === 0n
        ? 0
        : Number((profitLossPaisa * 10000n) / realizedRevenuePaisa) / 100;
    const contractedProfitLossPaisa = contractedRevenuePaisa - totalCostPaisa;
    const contractedMarginPercent =
      contractedRevenuePaisa === 0n
        ? 0
        : Number((contractedProfitLossPaisa * 10000n) / contractedRevenuePaisa) / 100;

    const result: ProjectProfitability = {
      projectId,
      budgetPaisa: project.budgetPaisa,
      extensionsPaisa,
      contractedRevenuePaisa,
      realizedRevenuePaisa,
      revenuePaisa,
      employeeCostPaisa,
      coreMemberCostPaisa,
      totalCostPaisa,
      profitLossPaisa,
      marginPercent,
      contractedProfitLossPaisa,
      contractedMarginPercent,
      forecastProfitLossPaisa: null,
      isTrendingOverBudget: totalCostPaisa > contractedRevenuePaisa,
    };
    if (useCache) {
      this.cache.set(projectId, result);
    }
    return result;
  }

  async calculateMany(
    projectIds: string[],
    options?: { from?: Date; to?: Date },
  ): Promise<ProjectProfitability[]> {
    const results: ProjectProfitability[] = [];
    for (const projectId of projectIds) {
      results.push(await this.calculateProjectProfitLoss(projectId, options));
    }
    return results;
  }

  async calculateProjectLaborSummary(
    projectId: string,
    options?: { from?: Date; to?: Date },
  ): Promise<ProjectLaborSummary> {
    const [project, orgSettings] = await Promise.all([
      this.prismaService.project.findUnique({
        where: { id: projectId },
        include: {
          employeeAssignments: {
            include: {
              employee: { include: { salaryEntries: true } },
            },
          },
          allocations: {
            include: {
              standupEntry: {
                include: {
                  standup: true,
                  employee: { include: { salaryEntries: true } },
                },
              },
            },
          },
        },
      }),
      this.prismaService.orgSettings.findFirst(),
    ]);

    if (!project) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }

    const cutoverDate = orgSettings?.standupTrackingStartDate ?? null;
    const byDate = new Map<
      string,
      {
        laborCostPaisa: bigint;
        allocationPercentTotal: number;
        standupIds: Set<string>;
        employeeIds: Set<string>;
      }
    >();

    const shouldIncludeStandups =
      cutoverDate !== null || project.allocations.length > 0;

    if (shouldIncludeStandups) {
      for (const allocation of project.allocations) {
        const standup = allocation.standupEntry.standup;
        if (cutoverDate && standup.date < cutoverDate) {
          continue;
        }
        if (options?.from && standup.date < options.from) {
          continue;
        }
        if (options?.to && standup.date > options.to) {
          continue;
        }
        if (allocation.standupEntry.attendanceStatus === AttendanceStatus.absent) {
          continue;
        }

        const salary = this.resolveSalary(
          allocation.standupEntry.employee.salaryEntries,
          standup.date,
        );
        if (salary === null) {
          continue;
        }

        const laborCostPaisa =
          (salary / BigInt(daysInMonth(standup.date)) * BigInt(allocation.percentage)) /
          100n;
        const date = toIsoDate(standup.date);
        const bucket = byDate.get(date) ?? {
          laborCostPaisa: 0n,
          allocationPercentTotal: 0,
          standupIds: new Set<string>(),
          employeeIds: new Set<string>(),
        };

        bucket.laborCostPaisa += laborCostPaisa;
        bucket.allocationPercentTotal += allocation.percentage;
        bucket.standupIds.add(standup.id);
        bucket.employeeIds.add(allocation.standupEntry.employeeId);
        byDate.set(date, bucket);
      }
    }

    const shouldIncludeAssignments =
      cutoverDate !== null || project.allocations.length === 0;

    if (shouldIncludeAssignments) {
      const assignmentRangeEnd = cutoverDate
        ? this.minDate(options?.to ?? new Date(), dayBefore(cutoverDate))
        : options?.to ?? new Date();

      const assignmentResult = await this.calculateEmployeeCostFromAssignments(
        project.employeeAssignments,
        project.startDate,
        options?.from,
        assignmentRangeEnd,
      );

      for (const [date, data] of assignmentResult.byDate.entries()) {
        const bucket = byDate.get(date) ?? {
          laborCostPaisa: 0n,
          allocationPercentTotal: 0,
          standupIds: new Set<string>(),
          employeeIds: new Set<string>(),
        };
        bucket.laborCostPaisa += data.laborCostPaisa;
        bucket.allocationPercentTotal += data.employeeIds.size > 0 ? 100 : 0;
        data.employeeIds.forEach((id) => bucket.employeeIds.add(id));
        byDate.set(date, bucket);
      }
    }

    let totalLaborCostPaisa = 0n;
    let allocationPercentTotal = 0;
    const allStandupIds = new Set<string>();
    const allEmployeeIds = new Set<string>();

    for (const bucket of byDate.values()) {
      totalLaborCostPaisa += bucket.laborCostPaisa;
      allocationPercentTotal += bucket.allocationPercentTotal;
      bucket.standupIds.forEach((id) => allStandupIds.add(id));
      bucket.employeeIds.forEach((id) => allEmployeeIds.add(id));
    }

    const daily = [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, bucket]) => ({
        date,
        laborCostPaisa: bucket.laborCostPaisa,
        allocationPercentTotal: bucket.allocationPercentTotal,
        standupCount: bucket.standupIds.size,
        employeeCount: bucket.employeeIds.size,
      }));

    return {
      totalLaborCostPaisa,
      completedStandupCount: allStandupIds.size,
      employeeCount: allEmployeeIds.size,
      allocationPercentTotal,
      daily,
    };
  }

  private async calculateEmployeeCostFromAssignments(
    assignments: Array<{
      projectId: string;
      assignedAt: Date;
      unassignedAt: Date | null;
      employee: {
        id: string;
        salaryEntries: Array<{ effectiveDate: Date; salaryPaisa: bigint }>;
      };
    }>,
    projectStart: Date,
    from?: Date,
    to?: Date,
  ): Promise<{
    totalCostPaisa: bigint;
    byDate: Map<string, { laborCostPaisa: bigint; employeeIds: Set<string> }>;
    employeeIds: Set<string>;
  }> {
    let total = 0n;
    const today = new Date();
    const rangeStart = from ?? projectStart;
    const rangeEnd = to ?? today;
    const byDate = new Map<
      string,
      { laborCostPaisa: bigint; employeeIds: Set<string> }
    >();
    const allEmployeeIds = new Set<string>();

    if (rangeStart > rangeEnd) {
      return { totalCostPaisa: 0n, byDate, employeeIds: allEmployeeIds };
    }

    for (const assignment of assignments) {
      const allAssignmentsForEmployee =
        await this.prismaService.projectAssignment.findMany({
          where: { employeeId: assignment.employee.id },
        });
      const start = this.maxDate(assignment.assignedAt, rangeStart);
      const end = this.minDate(assignment.unassignedAt ?? rangeEnd, rangeEnd);
      if (start > end) {
        continue;
      }
      for (
        let cursor = new Date(start);
        cursor <= end;
        cursor = new Date(cursor.getTime() + 86_400_000)
      ) {
        const salary = this.resolveSalary(
          assignment.employee.salaryEntries,
          cursor,
        );
        if (salary === null) {
          continue;
        }
        const concurrent = allAssignmentsForEmployee.filter((item) => {
          const assigned = item.assignedAt <= cursor;
          const stillActive =
            item.unassignedAt === null || item.unassignedAt >= cursor;
          return assigned && stillActive;
        }).length;
        if (concurrent === 0) {
          continue;
        }
        const dailyCost =
          salary / BigInt(daysInMonth(cursor)) / BigInt(concurrent);
        total += dailyCost;
        allEmployeeIds.add(assignment.employee.id);

        const dateKey = toIsoDate(cursor);
        const bucket = byDate.get(dateKey) ?? {
          laborCostPaisa: 0n,
          employeeIds: new Set<string>(),
        };
        bucket.laborCostPaisa += dailyCost;
        bucket.employeeIds.add(assignment.employee.id);
        byDate.set(dateKey, bucket);
      }
    }

    return { totalCostPaisa: total, byDate, employeeIds: allEmployeeIds };
  }

  private async calculateEmployeeCost(
    allocations: Array<{
      percentage: number;
      standupEntry: {
        attendanceStatus: AttendanceStatus;
        standup: { date: Date };
        employee: {
          salaryEntries: Array<{ effectiveDate: Date; salaryPaisa: bigint }>;
        };
      };
    }>,
    from?: Date,
    to?: Date,
  ): Promise<bigint> {
    let total = 0n;
    for (const allocation of allocations) {
      const standup = allocation.standupEntry.standup;
      if (from && standup.date < from) {
        continue;
      }
      if (to && standup.date > to) {
        continue;
      }
      if (allocation.standupEntry.attendanceStatus === AttendanceStatus.absent) {
        continue;
      }
      const salary = this.resolveSalary(
        allocation.standupEntry.employee.salaryEntries,
        standup.date,
      );
      if (salary === null) {
        continue;
      }
      const daily = salary / BigInt(daysInMonth(standup.date));
      total += (daily * BigInt(allocation.percentage)) / 100n;
    }
    return total;
  }

  private async calculateCoreMemberCost(
    assignments: Array<{
      projectId: string;
      assignedAt: Date;
      unassignedAt: Date | null;
      coreMember: {
        id: string;
        salaryEntries: Array<{ effectiveDate: Date; salaryPaisa: bigint }>;
        assignments?: Array<{
          projectId: string;
          assignedAt: Date;
          unassignedAt: Date | null;
        }>;
      };
    }>,
    projectStart: Date,
    from?: Date,
    to?: Date,
  ): Promise<bigint> {
    let total = 0n;
    const today = new Date();
    const rangeStart = from ?? projectStart;
    const rangeEnd = to ?? today;
    for (const assignment of assignments) {
      const memberAssignments =
        await this.prismaService.coreMemberAssignment.findMany({
          where: { coreMemberId: assignment.coreMember.id },
        });
      const start = this.maxDate(assignment.assignedAt, rangeStart);
      const end = this.minDate(assignment.unassignedAt ?? rangeEnd, rangeEnd);
      if (start > end) {
        continue;
      }
      for (
        let cursor = new Date(start);
        cursor <= end;
        cursor = new Date(cursor.getTime() + 86_400_000)
      ) {
        const salary = this.resolveSalary(
          assignment.coreMember.salaryEntries,
          cursor,
        );
        if (salary === null) {
          continue;
        }
        const concurrent = memberAssignments.filter((item) => {
          const assigned = item.assignedAt <= cursor;
          const stillActive =
            item.unassignedAt === null || item.unassignedAt >= cursor;
          return assigned && stillActive;
        }).length;
        if (concurrent === 0) {
          continue;
        }
        total += salary / BigInt(daysInMonth(cursor)) / BigInt(concurrent);
      }
    }
    return total;
  }

  private resolveSalary(
    entries: Array<{ effectiveDate: Date; salaryPaisa: bigint }>,
    onDate: Date,
  ): bigint | null {
    const applicable = entries
      .filter((entry) => toIsoDate(entry.effectiveDate) <= toIsoDate(onDate))
      .sort((a, b) => b.effectiveDate.getTime() - a.effectiveDate.getTime());
    return applicable[0]?.salaryPaisa ?? null;
  }

  private maxDate(a: Date, b: Date): Date {
    return a > b ? a : b;
  }

  private minDate(a: Date, b: Date): Date {
    return a < b ? a : b;
  }
}
