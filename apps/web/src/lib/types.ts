export type ClientStats = {
  profitLossPaisa: string
  employeesInvolved: Array<{ id: string; name: string }>
  coreMembersInvolved: Array<{ id: string; name: string }>
  standupsMentioned: number
}

export type Client = {
  id: string
  name: string
  contactInfo: string | null
  status: "active" | "inactive"
  createdAt: string
  updatedAt?: string
  _count?: { projects: number }
  projects?: Project[]
  stats?: ClientStats
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
  extensionCount?: number
  extensions?: ProjectExtension[]
  amcRecord?: AmcRecord | null
  employeeAssignments?: ProjectAssignment[]
  coreMemberAssignments?: CoreMemberAssignment[]
  dashboard?: ProjectDashboard
}

export type ProjectDashboard = {
  summary: {
    activeEmployeeCount: number
    activeCoreMemberCount: number
    employeeAssignmentCount: number
    coreMemberAssignmentCount: number
    extensionCount: number
    autoExtensionCount: number
    completedStandupCount: number
    standupEmployeeCount: number
    allocationPercentTotal: number
    laborCostPaisa: string
  }
  laborSeries: Array<{
    date: string
    laborCostPaisa: string
    allocationPercentTotal: number
    standupCount: number
    employeeCount: number
  }>
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
  endDate: string | null
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

export type AmcType = "complimentary" | "paid"
export type AmcRenewalDecision = "pending" | "renewed" | "declined"
export type AmcStatus =
  | "free_period"
  | "reminder_due"
  | "paid_pending"
  | "overdue"
  | "cancelled"

export type AmcRecord = {
  id: string
  projectId: string
  type: AmcType
  startDate: string
  endDate: string
  notes?: string | null
  renewalDecision?: AmcRenewalDecision | null
  status: AmcStatus | string
  isVatApplicable: boolean
  amcAmountPaisa: string | null
  cancelledAt?: string | null
  cancelledRemark?: string | null
  projectName?: string | null
  clientName?: string | null
  clientId?: string | null
  /** @deprecated use startDate */
  setDate?: string
  /** @deprecated use endDate */
  freeUntilDate?: string
  remark?: string | null
}

export type PersonStatus = "active" | "left"

export type Employee = {
  id: string
  name: string
  email: string
  status: PersonStatus
  dateJoined: string
  dateOfBirth?: string | null
  dateLeft: string | null
  salaryEntries?: SalaryEntry[]
  attendanceSummary?: {
    firstHalfLeave: number
    secondHalfLeave: number
    late: number
    paidAbsence: number
    unpaidAbsence: number
  }
  assignments?: Array<{
    id: string
    assignedAt: string
    unassignedAt: string | null
    project: { id: string; name: string; status: string }
  }>
  attendanceRecords?: Array<{
    id: string
    date: string
    type: "first_half_leave" | "second_half_leave" | "late" | "paid_absence" | "unpaid_absence"
  }>
  standupEntries?: Array<{
    id: string
    attendanceStatus: AttendanceStatus
    notesMarkdown: string | null
    standup: { id: string; date: string; status: string }
    allocations: Array<{
      id: string
      projectId: string
      percentage: number
      isNonBillable?: boolean
      project?: { id: string; name: string; status: string }
    }>
  }>
  groups?: Array<{ id: string; name: string }>
}

export type StandupScopePreference = "ask" | "everyone" | "group"

export type EmployeeGroupMember = {
  employeeId: string
  createdAt: string
  employee: {
    id: string
    name: string
    email: string
    status: PersonStatus
  }
}

export type EmployeeGroup = {
  id: string
  name: string
  description: string | null
  memberCount?: number
  members?: EmployeeGroupMember[]
  createdAt: string
  updatedAt: string
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

export type StandupCalendarDay = {
  id: string
  date: string
  status: StandupStatus
}

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
  employeeGroupId?: string | null
  employeeGroup?: { id: string; name: string } | null
  createdAt?: string
  createdBy?: { id: string; name: string; email: string }
  _count?: { entries: number }
  entries?: StandupEntry[]
}

export type StandupEntry = {
  id: string
  attendanceStatus: AttendanceStatus
  notesMarkdown: string | null
  employee: {
    id: string
    name: string
    email: string
    assignments?: Array<{
      id: string
      projectId?: string
      assignedAt: string
      unassignedAt: string | null
      project: { id: string; name: string; status: string }
    }>
  }
  allocations: Array<{
    id?: string
    projectId: string
    percentage: number
    isNonBillable?: boolean
    project?: { id: string; name: string; status: string }
  }>
}

export type MissingAssignmentAction =
  | "backward_extend"
  | "split"
  | "create"
  | "remove_allocation"

export type MissingProjectAssignment = {
  employeeId: string
  employeeName: string
  projectId: string
  projectName: string
  standupDate: string
  standupEntryId: string
  currentAssignedFrom?: string | null
  availableActions?: MissingAssignmentAction[]
}

export type AssignmentResolution = {
  employeeId: string
  projectId: string
  action: MissingAssignmentAction
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
  period?: {
    accruedPaisa: string
    clearedPaisa: string
    unpaidPaisa: string
  } | null
}

export type VatAccrualEntry = {
  id: string
  description: string
  amountPaisa: string
  occurredAt: string
  sourceType: "project" | "extension" | "amc"
  sourceId: string
}

export type VatClearance = {
  id: string
  amountPaisa: string
  note: string | null
  clearedAt?: string
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

export type UserRole = "super_admin" | "admin" | "manager"

export type SystemUser = {
  id: string
  email: string
  name: string
  isActive: boolean
  mustChangePassword: boolean
  lastLoginAt: string | null
  role: UserRole | string | null
  createdAt: string
  updatedAt?: string
}
