export type Client = {
  id: string
  name: string
  contactInfo: string | null
  status: "active" | "inactive"
  createdAt: string
  updatedAt?: string
  _count?: { projects: number }
  projects?: Project[]
}

export type Category = {
  id: string
  name: string
  isActive: boolean
  isSeeded?: boolean
}

export type ProjectStatus = "active" | "extended" | "closed" | "under_amc"

export type Project = {
  id: string
  name: string
  clientId: string
  categoryIds?: string[]
  budgetPaisa: string
  startDate: string
  endDate: string
  status: ProjectStatus
  isVatApplicable: boolean
  vatRateApplied?: number
  autoExtended?: boolean
  client?: { id: string; name: string }
  categories?: Array<{ id: string; name: string }>
  profitability?: ProjectProfitability
  extensions?: ProjectExtension[]
  amcRecord?: AmcRecord | null
  employeeAssignments?: ProjectAssignment[]
  coreMemberAssignments?: CoreMemberAssignment[]
}

export type ProjectProfitability = {
  projectId: string
  budgetPaisa: string
  extensionsPaisa: string
  revenuePaisa: string
  employeeCostPaisa: string
  coreMemberCostPaisa: string
  totalCostPaisa: string
  profitLossPaisa: string
  marginPercent: number
  forecastProfitLossPaisa: string | null
  isTrendingOverBudget: boolean
}

export type ProjectExtension = {
  id: string
  reason: string
  amountPaisa: string
  isProfit: boolean
  isAuto: boolean
  createdAt: string
}

export type ProjectAssignment = {
  id: string
  employeeId: string
  assignedAt: string
  unassignedAt: string | null
  employee?: { id: string; name: string; email: string; status: string }
}

export type CoreMemberAssignment = {
  id: string
  coreMemberId: string
  assignedAt: string
  unassignedAt: string | null
  coreMember?: { id: string; name: string; email: string; status: string }
}

export type AmcRecord = {
  id: string
  projectId: string
  setDate: string
  freeUntilDate: string
  status: string
  isVatApplicable: boolean
  amcAmountPaisa: string | null
  remark?: string | null
}

export type PersonStatus = "active" | "left"

export type Employee = {
  id: string
  name: string
  email: string
  status: PersonStatus
  dateJoined: string
  dateLeft: string | null
  salaryEntries?: SalaryEntry[]
  attendanceSummary?: Record<string, number>
}

export type CoreMember = {
  id: string
  name: string
  email: string
  status: PersonStatus
  dateJoined: string
  dateLeft: string | null
  salaryEntries?: SalaryEntry[]
}

export type SalaryEntry = {
  id: string
  salaryPaisa: string
  effectiveDate: string
  reason: string | null
  createdAt?: string
}

export type StandupStatus = "draft" | "in_progress" | "completed"
export type AttendanceStatus =
  | "present"
  | "first_half_leave"
  | "second_half_leave"
  | "late"
  | "absent"

export type Standup = {
  id: string
  date: string
  status: StandupStatus
  createdAt?: string
  createdBy?: { id: string; name: string; email: string }
  _count?: { entries: number }
  entries?: StandupEntry[]
  overrides?: Array<{ id: string; projectId: string; reason: string; project?: { name: string } }>
}

export type StandupEntry = {
  id: string
  attendanceStatus: AttendanceStatus
  notesMarkdown: string | null
  employee: { id: string; name: string; email: string }
  allocations: Array<{
    id?: string
    projectId: string
    percentage: number
    isNonBillable?: boolean
    project?: { id: string; name: string; status: string }
  }>
}

export type OrgSettings = {
  id: string
  vatRatePercent: number
  paidLeaveDaysPerMonth: number
  amcReminderLeadDays: number
  healthHealthyMinPercent: number
  healthAtRiskMinPercent: number
}

export type VatAccumulated = {
  accruedPaisa: string
  clearedPaisa: string
  unpaidPaisa: string
}

export type VatClearance = {
  id: string
  amountPaisa: string
  note: string | null
  createdAt: string
  clearedBy?: { id: string; name: string; email: string }
}

export type AuditLog = {
  id: string
  action: string
  targetType: string
  targetId: string
  /** @deprecated API uses targetType */
  entityType?: string
  /** @deprecated API uses targetId */
  entityId?: string
  summary?: string | null
  metadata?: unknown
  createdAt: string
  actor?: { id: string; name: string; email: string } | null
}

export type DashboardSummary = {
  totalProfitPaisa: string
  totalLossPaisa: string
  overallMarginPercent: number
  activeCount: number
  closedCount: number
  top5Profitable: Array<{
    id: string
    name: string
    profitLossPaisa: string
    marginPercent: number
  }>
  top5LossMaking: Array<{
    id: string
    name: string
    profitLossPaisa: string
    marginPercent: number
  }>
  trendingOverBudget: Array<{ id: string; name: string }>
  accumulatedVat: { unpaidPaisa: string }
  amcReminders: Array<{ projectId: string; projectName: string; status: string }>
  categoryBreakdown: Array<{
    categoryId: string
    categoryName: string
    profitLossPaisa: string
    marginPercent: number
  }>
}
