import { Injectable, NotFoundException } from "@nestjs/common";
import { AttendanceStatus } from "@workspace/database";
import { daysInMonth } from "../_shared/utils/date.util";
import { PrismaService } from "../prisma/prisma.service";

export type ProjectProfitability = {
  projectId: string;
  budgetPaisa: bigint;
  extensionsPaisa: bigint;
  revenuePaisa: bigint;
  employeeCostPaisa: bigint;
  coreMemberCostPaisa: bigint;
  totalCostPaisa: bigint;
  profitLossPaisa: bigint;
  marginPercent: number;
  forecastProfitLossPaisa: bigint | null;
  isTrendingOverBudget: boolean;
};

export type ProjectLaborSeriesPoint = {
  month: string;
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
  monthly: ProjectLaborSeriesPoint[];
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
    const project = await this.prismaService.project.findUnique({
      where: { id: projectId },
      include: {
        extensions: true,
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
    });
    if (!project) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }
    const extensionsPaisa = project.extensions.reduce(
      (sum, extension) => sum + extension.amountPaisa,
      0n,
    );
    const employeeCostPaisa = await this.calculateEmployeeCost(
      project.allocations,
      options?.from,
      options?.to,
    );
    const coreMemberCostPaisa = await this.calculateCoreMemberCost(
      project.coreMemberAssignments,
      project.startDate,
      options?.from,
      options?.to,
    );
    const revenuePaisa = project.budgetPaisa + extensionsPaisa;
    const totalCostPaisa = employeeCostPaisa + coreMemberCostPaisa;
    const profitLossPaisa = revenuePaisa - totalCostPaisa;
    const marginPercent =
      revenuePaisa === 0n
        ? 0
        : Number((profitLossPaisa * 10000n) / revenuePaisa) / 100;
    const result: ProjectProfitability = {
      projectId,
      budgetPaisa: project.budgetPaisa,
      extensionsPaisa,
      revenuePaisa,
      employeeCostPaisa,
      coreMemberCostPaisa,
      totalCostPaisa,
      profitLossPaisa,
      marginPercent,
      forecastProfitLossPaisa: null,
      isTrendingOverBudget: false,
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
    const allocations = await this.prismaService.projectAllocation.findMany({
      where: { projectId },
      include: {
        standupEntry: {
          include: {
            standup: true,
            employee: { include: { salaryEntries: true } },
          },
        },
      },
    });

    const byMonth = new Map<
      string,
      {
        laborCostPaisa: bigint;
        allocationPercentTotal: number;
        standupIds: Set<string>;
        employeeIds: Set<string>;
      }
    >();
    const standupIds = new Set<string>();
    const employeeIds = new Set<string>();
    let totalLaborCostPaisa = 0n;
    let allocationPercentTotal = 0;

    for (const allocation of allocations) {
      const standup = allocation.standupEntry.standup;
      if (standup.status !== "completed") {
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
      const month = standup.date.toISOString().slice(0, 7);
      const bucket = byMonth.get(month) ?? {
        laborCostPaisa: 0n,
        allocationPercentTotal: 0,
        standupIds: new Set<string>(),
        employeeIds: new Set<string>(),
      };

      bucket.laborCostPaisa += laborCostPaisa;
      bucket.allocationPercentTotal += allocation.percentage;
      bucket.standupIds.add(standup.id);
      bucket.employeeIds.add(allocation.standupEntry.employeeId);
      byMonth.set(month, bucket);

      totalLaborCostPaisa += laborCostPaisa;
      allocationPercentTotal += allocation.percentage;
      standupIds.add(standup.id);
      employeeIds.add(allocation.standupEntry.employeeId);
    }

    const monthly = [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, bucket]) => ({
        month,
        laborCostPaisa: bucket.laborCostPaisa,
        allocationPercentTotal: bucket.allocationPercentTotal,
        standupCount: bucket.standupIds.size,
        employeeCount: bucket.employeeIds.size,
      }));

    return {
      totalLaborCostPaisa,
      completedStandupCount: standupIds.size,
      employeeCount: employeeIds.size,
      allocationPercentTotal,
      monthly,
    };
  }

  private async calculateEmployeeCost(
    allocations: Array<{
      percentage: number;
      standupEntry: {
        attendanceStatus: AttendanceStatus;
        standup: { date: Date; status: string };
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
      if (standup.status !== "completed") {
        continue;
      }
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
      .filter((entry) => entry.effectiveDate <= onDate)
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
