export type ClientStats = {
  profitLossPaisa: string
  employeesInvolved: Array<{ id: string; name: string }>
  coreMembersInvolved: Array<{ id: string; name: string }>
  standupsMentioned: number
}

export type Client = {
  id: string
  name: string
  email: string | null
  phone: string | null
  additionalInfo: string | null
  /** @deprecated Use additionalInfo */
  contactInfo?: string | null
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
  _count?: { projectCategories: number }
  projects?: Project[]
}

export type ProjectStatus = "active" | "extended" | "closed" | "under_amc"

export type Project = {
  id: string
  name: string
  clientId: string
  /** Hex accent (#RRGGBB) used in stand-ups. */
  themeColor?: string
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
  contactNumber?: string | null
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
    miscellaneousNotes: string | null
    standup: { id: string; date: string; status: string }
    allocations: Array<{
      id: string
      projectId: string
      percentage: number
      isNonBillable?: boolean
      project?: { id: string; name: string; status: string }
      tasks?: StandupTask[]
    }>
  }>
  groups?: Array<{ id: string; name: string }>
}

export type StandupScopePreference = "ask" | "everyone" | "group"
export type StandupLayoutPreference = "card" | "table"
export type StandupProjectAccentPreference = "off" | "muted" | "on"
export type StandupTaskState = "open" | "done" | "tomorrow" | "progress"

export type StandupTask = {
  id: string
  text: string
  state: StandupTaskState
  blocker: string | null
  sortOrder?: number
}

export type EmployeeGroupMember = {
  employeeId: string
  createdAt: string
  employee: {
    id: string
    name: string
    email: string
    contactNumber?: string | null
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
  contactNumber?: string | null
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

export type StandupCalendarDay = {
  id: string
  date: string
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
  employeeGroupId?: string | null
  employeeGroup?: { id: string; name: string } | null
  createdAt?: string
  updatedAt?: string
  createdBy?: { id: string; name: string; email: string }
  updatedBy?: { id: string; name: string; email: string }
  _count?: { entries: number }
  stats?: {
    working: number
    absent: number
    projectCount: number
  }
  entries?: StandupEntry[]
}

export type StandupEntry = {
  id: string
  attendanceStatus: AttendanceStatus
  miscellaneousNotes: string | null
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
    tasks?: StandupTask[]
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
  smtpHost?: string | null
  smtpPort?: number
  smtpSecure?: boolean
  smtpUser?: string | null
  smtpPassSet?: boolean
  smtpFrom?: string | null
}

export type UserPasskey = {
  id: string
  name: string
  lastUsedAt: string | null
  createdAt: string
  deviceType?: string | null
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
  netProfitLossPaisa: string
  totalRevenuePaisa: string
  overallMarginPercent: number
  activeClients: number
  clientsWithActiveProjects: number
  activeCount: number
  closedCount: number
  closedFreeAmcCount: number
  closedPaidAmcCount: number
  totalEmployees: number
  totalStandups: number
  amcValuePaisa: string
  activeAmcs: number
  canViewAudit: boolean
  top5Profitable: Array<{
    id: string
    name: string
    clientName: string
    profitLossPaisa: string
    marginPercent: number
  }>
  top5LossMaking: Array<{
    id: string
    name: string
    clientName: string
    profitLossPaisa: string
    marginPercent: number
  }>
  trendingOverBudget: Array<{
    id: string
    name: string
    clientName: string
    marginPercent: number
  }>
  accumulatedVat: { unpaidPaisa: string }
  amcReminders: Array<{
    id: string
    projectId: string
    projectName: string
    clientName: string
    status: string
    endDate: string
    amcAmountPaisa: string | null
  }>
  amcContracts: Array<{
    id: string
    projectId: string
    projectName: string
    clientName: string
    status: string
    endDate: string
    amcAmountPaisa: string | null
  }>
  categoryBreakdown: Array<{
    categoryId: string
    categoryName: string
    profitLossPaisa: string
  }>
  groupCounts: Array<{
    groupId: string
    groupName: string
    count: number
  }>
  profitTrend: Array<{
    label: string
    month: string
    revenuePaisa: string
    profitLossPaisa: string
  }>
  recentStandups: Array<{
    id: string
    date: string
    authorName: string
    groupName: string
    entryCount: number
  }>
  recentAudit: Array<{
    id: string
    action: string
    targetType: string
    targetId: string
    createdAt: string
    actorName: string
  }>
}

export type UserRole = "super_admin" | "admin" | "manager" | "standup_taker"

export type SystemUser = {
  id: string
  email: string
  name: string
  isActive: boolean
  mustChangePassword: boolean
  lastLoginAt: string | null
  role: UserRole | string | null
  standupScopePreference?: "ask" | "everyone" | "group"
  standupLayoutPreference?: StandupLayoutPreference
  standupProjectAccentPreference?: StandupProjectAccentPreference
  standupPreferredGroupId?: string | null
  standupPreferredGroup?: { id: string; name: string } | null
  createdAt: string
  updatedAt?: string
}
