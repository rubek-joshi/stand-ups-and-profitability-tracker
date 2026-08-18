import { format, formatDistanceToNow, parseISO } from "date-fns"

import { paisaToNpr } from "@/lib/money"
import type { DashboardSummary, OrgSettings } from "@/lib/types"

export type DateRange = {
  from: Date
  to: Date
}

export type DashboardProjectRow = {
  id: string
  name: string
  client: string
  profitLossPaisa: string
  marginPercent: number
}

export type DashboardAmcRow = {
  id: string
  projectId: string
  name: string
  client: string
  status: string
  endDate: string
  valuePaisa: string | null
}

export type DashboardData = {
  settings: OrgSettings | null
  netProfitPaisa: string
  totalRevenuePaisa: string
  marginPct: number
  activeClients: number
  clientsWithActiveProjects: number
  activeProjects: number
  closedProjects: number
  closedFreeAmc: number
  closedPaidAmc: number
  unpaidVatPaisa: string
  amcValuePaisa: string
  activeAmcs: number
  totalStandups: number
  totalEmployees: number
  canViewAudit: boolean
  topProjects: DashboardProjectRow[]
  worstProjects: DashboardProjectRow[]
  atRiskProjects: DashboardProjectRow[]
  amcFollowUps: DashboardAmcRow[]
  amcList: DashboardAmcRow[]
  categoryBreakdown: Array<{
    categoryId: string
    categoryName: string
    profitLossPaisa: string
  }>
  groupCounts: Array<{ group: string; count: number }>
  trend: Array<{ label: string; revenue: number; profit: number }>
  recentStandups: Array<{
    id: string
    author: string
    group: string
    summary: string
    at: string
  }>
  recentAudit: Array<{
    id: string
    actor: string
    action: string
    target: string
    at: string
  }>
}

export function toIsoDateInput(date: Date): string {
  return format(date, "yyyy-MM-dd")
}

export function formatAuditAction(action: string): string {
  return action
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

export function relativeTime(iso: string): string {
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true })
  } catch {
    return iso
  }
}

export function buildDashboard(
  summary: DashboardSummary,
  settings: OrgSettings | null,
): DashboardData {
  const mapProject = (
    row: DashboardSummary["top5Profitable"][number],
  ): DashboardProjectRow => ({
    id: row.id,
    name: row.name,
    client: row.clientName,
    profitLossPaisa: row.profitLossPaisa,
    marginPercent: row.marginPercent,
  })

  const mapAmc = (
    row: DashboardSummary["amcReminders"][number],
  ): DashboardAmcRow => ({
    id: row.id,
    projectId: row.projectId,
    name: row.projectName,
    client: row.clientName,
    status: row.status,
    endDate: row.endDate,
    valuePaisa: row.amcAmountPaisa,
  })

  return {
    settings,
    netProfitPaisa: summary.netProfitLossPaisa,
    totalRevenuePaisa: summary.totalRevenuePaisa,
    marginPct: summary.overallMarginPercent,
    activeClients: summary.activeClients,
    clientsWithActiveProjects: summary.clientsWithActiveProjects ?? 0,
    activeProjects: summary.activeCount,
    closedProjects: summary.closedCount,
    closedFreeAmc: summary.closedFreeAmcCount ?? 0,
    closedPaidAmc: summary.closedPaidAmcCount ?? 0,
    unpaidVatPaisa: summary.accumulatedVat?.unpaidPaisa ?? "0",
    amcValuePaisa: summary.amcValuePaisa,
    activeAmcs: summary.activeAmcs,
    totalStandups: summary.totalStandups,
    totalEmployees: summary.totalEmployees,
    canViewAudit: summary.canViewAudit,
    topProjects: (summary.top5Profitable ?? []).map(mapProject),
    worstProjects: (summary.top5LossMaking ?? []).map(mapProject),
    atRiskProjects: (summary.trendingOverBudget ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      client: row.clientName,
      profitLossPaisa: "0",
      marginPercent: row.marginPercent,
    })),
    amcFollowUps: (summary.amcReminders ?? []).map(mapAmc),
    amcList: (summary.amcContracts ?? []).map(mapAmc),
    categoryBreakdown: summary.categoryBreakdown ?? [],
    groupCounts: (summary.groupCounts ?? []).map((row) => ({
      group: row.groupName,
      count: row.count,
    })),
    trend: (summary.profitTrend ?? []).map((row) => ({
      label: row.label,
      revenue: paisaToNpr(row.revenuePaisa),
      profit: paisaToNpr(row.profitLossPaisa),
    })),
    recentStandups: (summary.recentStandups ?? []).map((row) => ({
      id: row.id,
      author: row.authorName,
      group: row.groupName,
      summary: `${row.entryCount} participant${row.entryCount === 1 ? "" : "s"}`,
      at: row.date,
    })),
    recentAudit: (summary.recentAudit ?? []).map((row) => ({
      id: row.id,
      actor: row.actorName,
      action: formatAuditAction(row.action),
      target: `${row.targetType} ${row.targetId.slice(0, 8)}…`,
      at: row.createdAt,
    })),
  }
}
