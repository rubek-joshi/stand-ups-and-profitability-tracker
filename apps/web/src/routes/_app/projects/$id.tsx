import * as React from "react"
import { Link, createFileRoute } from "@tanstack/react-router"
import {
  IconDotsVertical,
  IconEye,
  IconLock,
  IconPencil,
  IconPlus,
  IconShieldCheck,
  IconTrash,
  IconUserMinus,
  IconUserPlus,
} from "@tabler/icons-react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@workspace/ui/components/chart"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Progress } from "@workspace/ui/components/progress"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { AmcCard } from "@/components/amc/amc-card"
import { CreateAmcDialog } from "@/components/amc/create-amc-dialog"
import { DeclineAmcDialog } from "@/components/amc/decline-amc-dialog"
import { EditAmcDialog } from "@/components/amc/edit-amc-dialog"
import { ProjectInvoicesTab } from "@/components/invoices/project-invoices-tab"
import {
  DEFAULT_PRESET_DAYS,
  rangeFromDays,
} from "@/components/dashboard/date-range-bar"
import { HealthBadge, StatusBadge } from "@/components/health-badge"
import { PageHeader } from "@/components/page-header"
import { PaginationBar } from "@/components/pagination-bar"
import { CoreMemberLink, EmployeeLink } from "@/components/resource-link"
import {
  NavigableTableRow,
  TableActionButton,
  TableActionLink,
  TableActionsCell,
  TableActionsHead,
} from "@/components/table-row-actions"
import { useConfirmDialog } from "@/components/confirm-dialog"
import { StandupHistoryView } from "@/components/standup/standup-history-view"
import { ErrorState, LoadingState } from "@/components/ui-states"
import { AUDIT_ROLES } from "@/lib/access"
import { api, ApiError, type Envelope } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { toIsoDateInput } from "@/lib/dashboard-metrics"
import {
  DEFAULT_LIST_SEARCH,
  clampPage,
  totalPagesFor,
  type PageSize,
} from "@/lib/list-query"
import { formatNpr, paisaToNpr, parseNprInput } from "@/lib/money"
import type {
  AmcRecord,
  CoreMember,
  CoreMemberAssignment,
  Employee,
  Project,
  ProjectAssignment,
  ProjectLink,
} from "@/lib/types"

const PROJECT_TABS = ["team", "standups", "extensions", "invoices", "amc", "labor"] as const

type ProjectTab = (typeof PROJECT_TABS)[number]

function defaultStandupHistoryRange() {
  const range = rangeFromDays(DEFAULT_PRESET_DAYS)
  return {
    from: toIsoDateInput(range.from),
    to: toIsoDateInput(range.to),
  }
}

function parseIsoSearchDate(value: unknown): string {
  if (typeof value !== "string") return ""
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ""
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
  } catch {
    return false
  }
}

function maxIsoDate(
  ...values: Array<string | null | undefined>
): string | undefined {
  const dates = values
    .map((value) => (value ? String(value).slice(0, 10) : ""))
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
  if (dates.length === 0) return undefined
  return dates.reduce((latest, next) => (next > latest ? next : latest))
}

function parseEmployeeIdsSearch(search: Record<string, unknown>): string[] {
  const fromList =
    typeof search.employeeIds === "string"
      ? search.employeeIds
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      : Array.isArray(search.employeeIds)
        ? search.employeeIds.filter(
            (value): value is string =>
              typeof value === "string" && value.trim().length > 0
          )
        : []
  return [...new Set(fromList)]
}

function parseProjectTab(value: unknown): ProjectTab {
  return PROJECT_TABS.includes(value as ProjectTab)
    ? (value as ProjectTab)
    : "team"
}

export const Route = createFileRoute("/_app/projects/$id")({
  validateSearch: (search: Record<string, unknown>) => {
    const defaults = defaultStandupHistoryRange()
    const from = parseIsoSearchDate(search.from)
    const to = parseIsoSearchDate(search.to)
    return {
      tab: parseProjectTab(search.tab),
      q: typeof search.q === "string" ? search.q : "",
      employeeIds: parseEmployeeIdsSearch(search).join(","),
      from: from && to ? from : defaults.from,
      to: from && to ? to : defaults.to,
    }
  },
  component: ProjectDetailPage,
})

function ProjectDetailPage() {
  const { id } = Route.useParams()
  const navigate = Route.useNavigate()
  const { tab, q, employeeIds, from, to } = Route.useSearch()
  const employeeIdList = React.useMemo(
    () =>
      employeeIds
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    [employeeIds]
  )
  const { user } = useAuth()
  const { confirm, dialog } = useConfirmDialog()
  const canDeleteAmc = user?.role === "super_admin"
  const canDeleteAssignmentLogs = user?.role === "super_admin"
  const canManageLinks = Boolean(
    user?.role && (AUDIT_ROLES as string[]).includes(user.role)
  )
  const [project, setProject] = React.useState<Project | null>(null)
  const [assignments, setAssignments] = React.useState<{
    employees: ProjectAssignment[]
    coreMembers: CoreMemberAssignment[]
  }>({ employees: [], coreMembers: [] })
  const [employees, setEmployees] = React.useState<Employee[]>([])
  const [coreMembers, setCoreMembers] = React.useState<CoreMember[]>([])
  const [amcs, setAmcs] = React.useState<AmcRecord[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [extReason, setExtReason] = React.useState("")
  const [extAmount, setExtAmount] = React.useState("0")
  const [extEndDate, setExtEndDate] = React.useState("")
  const [employeeAddOpen, setEmployeeAddOpen] = React.useState(false)
  const [employeeQuery, setEmployeeQuery] = React.useState("")
  const [selectedEmployeeIds, setSelectedEmployeeIds] = React.useState<
    string[]
  >([])
  const [addingEmployees, setAddingEmployees] = React.useState(false)
  const [employeeAssignedFrom, setEmployeeAssignedFrom] = React.useState(() =>
    toIsoDateInput(new Date())
  )
  const [employeeLastDay, setEmployeeLastDay] = React.useState("")
  const [releaseEmployeeAssignment, setReleaseEmployeeAssignment] =
    React.useState<ProjectAssignment | null>(null)
  const [employeeReleaseDate, setEmployeeReleaseDate] = React.useState(() =>
    toIsoDateInput(new Date())
  )
  const [releasingEmployee, setReleasingEmployee] = React.useState(false)
  const [coreMemberAddOpen, setCoreMemberAddOpen] = React.useState(false)
  const [coreMemberQuery, setCoreMemberQuery] = React.useState("")
  const [selectedCoreMemberIds, setSelectedCoreMemberIds] = React.useState<
    string[]
  >([])
  const [addingCoreMembers, setAddingCoreMembers] = React.useState(false)
  const [coreAssignedFrom, setCoreAssignedFrom] = React.useState(() =>
    toIsoDateInput(new Date())
  )
  const [coreLastDay, setCoreLastDay] = React.useState("")
  const [releaseAssignment, setReleaseAssignment] =
    React.useState<CoreMemberAssignment | null>(null)
  const [releaseDate, setReleaseDate] = React.useState(() =>
    toIsoDateInput(new Date())
  )
  const [releasing, setReleasing] = React.useState(false)
  const [linkOpen, setLinkOpen] = React.useState(false)
  const [editingLink, setEditingLink] = React.useState<ProjectLink | null>(null)
  const [linkForm, setLinkForm] = React.useState({ label: "", url: "" })
  const [savingLink, setSavingLink] = React.useState(false)
  const [closeOpen, setCloseOpen] = React.useState(false)
  const [closeDate, setCloseDate] = React.useState("")
  const [closing, setClosing] = React.useState(false)
  const [amcCreateOpen, setAmcCreateOpen] = React.useState(false)
  const [extensionOpen, setExtensionOpen] = React.useState(false)
  const [declineAmc, setDeclineAmc] = React.useState<AmcRecord | null>(null)
  const [editAmc, setEditAmc] = React.useState<AmcRecord | null>(null)
  const [logPage, setLogPage] = React.useState(1)
  const [logPageSize, setLogPageSize] = React.useState<PageSize>(10)
  const [coreLogPage, setCoreLogPage] = React.useState(1)
  const [coreLogPageSize, setCoreLogPageSize] = React.useState<PageSize>(10)
  const initialLoad = React.useRef(true)

  const load = React.useCallback(async () => {
    if (initialLoad.current) setLoading(true)
    setError(null)
    try {
      const [p, a, emps, cores] = await Promise.all([
        api<Envelope<Project>>(`/projects/${id}`),
        api<
          Envelope<{
            employees: ProjectAssignment[]
            coreMembers: CoreMemberAssignment[]
          }>
        >(`/projects/${id}/assignments`),
        api<Envelope<Employee[]>>("/employees"),
        api<Envelope<CoreMember[]>>("/core-members"),
      ])
      setProject(p.data)
      setAssignments(a.data)
      setEmployees(emps.data)
      setCoreMembers(cores.data)
      try {
        const amcRes = await api<Envelope<AmcRecord[]>>(`/amc/projects/${id}`)
        setAmcs(amcRes.data)
      } catch {
        setAmcs([])
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load project")
    } finally {
      setLoading(false)
      initialLoad.current = false
    }
  }, [id])

  React.useEffect(() => {
    initialLoad.current = true
    void load()
  }, [load])

  if (loading) return <LoadingState />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (!project) return null

  const profit = project.profitability
  const dashboard = project.dashboard
  const summary = dashboard?.summary
  const laborSeries = dashboard?.laborSeries ?? []
  const canManageAssignments =
    project.status !== "closed" && project.status !== "under_amc"
  const projectNeedsEndDate =
    project.status === "closed" || project.status === "under_amc"
  const todayIso = toIsoDateInput(new Date())
  const canDeleteProject = Boolean(project.canDelete)
  const assignedEmployeeIds = new Set(
    assignments.employees
      .filter((assignment) => !assignment.unassignedAt)
      .map((assignment) => assignment.employeeId)
  )
  const assignedCoreMemberIds = new Set(
    assignments.coreMembers
      .filter((assignment) => !assignment.unassignedAt)
      .map((assignment) => assignment.coreMemberId)
  )
  const activeAssignments = assignments.employees.filter(
    (assignment) => !assignment.unassignedAt
  )
  const availableEmployees = employees.filter(
    (employee) => !assignedEmployeeIds.has(employee.id)
  )
  const availableCoreMembers = coreMembers.filter(
    (member) => !assignedCoreMemberIds.has(member.id)
  )
  const filteredAvailableEmployees = availableEmployees.filter((employee) => {
    const query = employeeQuery.trim().toLowerCase()
    if (!query) return true
    return (
      employee.name.toLowerCase().includes(query) ||
      employee.email.toLowerCase().includes(query)
    )
  })
  const filteredAvailableCoreMembers = availableCoreMembers.filter((member) => {
    const query = coreMemberQuery.trim().toLowerCase()
    if (!query) return true
    return (
      member.name.toLowerCase().includes(query) ||
      member.email.toLowerCase().includes(query)
    )
  })
  const allFilteredSelected =
    filteredAvailableEmployees.length > 0 &&
    filteredAvailableEmployees.every((employee) =>
      selectedEmployeeIds.includes(employee.id)
    )
  const allFilteredCoreSelected =
    filteredAvailableCoreMembers.length > 0 &&
    filteredAvailableCoreMembers.every((member) =>
      selectedCoreMemberIds.includes(member.id)
    )
  const vatAmountPaisa =
    project.isVatApplicable && profit
      ? Math.round(
          (Number(profit.revenuePaisa) * (project.vatRateApplied ?? 0)) / 100
        )
      : 0
  const assignmentLog = assignments.employees
  const logTotalPages = totalPagesFor(assignmentLog.length, logPageSize)
  const logPageSafe = clampPage(logPage, logTotalPages)
  const pagedAssignmentLog = assignmentLog.slice(
    (logPageSafe - 1) * logPageSize,
    logPageSafe * logPageSize
  )
  const activeCoreAssignments = assignments.coreMembers.filter(
    (assignment) => !assignment.unassignedAt
  )
  const coreAssignmentLog = assignments.coreMembers
  const coreLogTotalPages = totalPagesFor(
    coreAssignmentLog.length,
    coreLogPageSize
  )
  const coreLogPageSafe = clampPage(coreLogPage, coreLogTotalPages)
  const pagedCoreAssignmentLog = coreAssignmentLog.slice(
    (coreLogPageSafe - 1) * coreLogPageSize,
    coreLogPageSafe * coreLogPageSize
  )

  const hasManualExtension = (project.extensions ?? []).some(
    (extension) => !extension.isAuto
  )
  const wasAutoExtended = Boolean(project.autoExtended)
  const projectStartDay = String(project.startDate).slice(0, 10)
  const projectEndDay = String(project.endDate).slice(0, 10)
  const latestAssignmentEnd = maxIsoDate(
    ...assignments.employees.map((assignment) => assignment.unassignedAt),
    ...assignments.coreMembers.map((assignment) => assignment.unassignedAt)
  )
  const latestOpenAssignedFrom = maxIsoDate(
    ...activeAssignments.map((assignment) => assignment.assignedAt),
    ...activeCoreAssignments.map((assignment) => assignment.assignedAt)
  )
  const minCloseDate =
    maxIsoDate(
      projectStartDay,
      latestAssignmentEnd,
      latestOpenAssignedFrom,
      hasManualExtension ? projectEndDay : undefined
    ) ?? projectStartDay
  const closeDateTooEarly = Boolean(closeDate && closeDate < minCloseDate)
  const closeDateInFuture = Boolean(closeDate && closeDate > todayIso)
  const cannotCloseYet = minCloseDate > todayIso
  const closeBlockedReason = cannotCloseYet
    ? hasManualExtension
      ? `This project has a manual extension until ${projectEndDay}. It cannot be closed before that date.`
      : latestAssignmentEnd && latestAssignmentEnd > todayIso
        ? `Close date cannot be before ${latestAssignmentEnd}, the latest assignment end date.`
        : `Close date cannot be before ${minCloseDate}.`
    : closeDateTooEarly
      ? hasManualExtension && closeDate < projectEndDay
        ? `This project has a manual extension until ${projectEndDay}. Close date cannot be before that date.`
        : latestAssignmentEnd && closeDate < latestAssignmentEnd
          ? `Close date cannot be before ${latestAssignmentEnd}, the latest assignment end date.`
          : `Close date cannot be before ${minCloseDate}.`
      : closeDateInFuture
        ? "Close date cannot be in the future."
        : null

  const openAddEmployees = () => {
    const today = toIsoDateInput(new Date())
    setEmployeeQuery("")
    setSelectedEmployeeIds([])
    setEmployeeAssignedFrom(today)
    setEmployeeLastDay(projectNeedsEndDate ? today : "")
    setEmployeeAddOpen(true)
  }

  const openAddCoreMembers = () => {
    const today = toIsoDateInput(new Date())
    setCoreMemberQuery("")
    setSelectedCoreMemberIds([])
    setCoreAssignedFrom(today)
    setCoreLastDay(projectNeedsEndDate ? today : "")
    setCoreMemberAddOpen(true)
  }

  const openReleaseEmployee = (assignment: ProjectAssignment) => {
    setReleaseEmployeeAssignment(assignment)
    setEmployeeReleaseDate(toIsoDateInput(new Date()))
  }

  const openReleaseCoreMember = (assignment: CoreMemberAssignment) => {
    setReleaseAssignment(assignment)
    setReleaseDate(toIsoDateInput(new Date()))
  }

  const openCreateLink = () => {
    setEditingLink(null)
    setLinkForm({ label: "", url: "" })
    setLinkOpen(true)
  }

  const openCloseProject = () => {
    setCloseDate(toIsoDateInput(new Date()))
    setCloseOpen(true)
  }

  const openEditLink = (link: ProjectLink) => {
    setEditingLink(link)
    setLinkForm({ label: link.label, url: link.url })
    setLinkOpen(true)
  }

  const toggleEmployee = (employeeId: string, checked: boolean) => {
    setSelectedEmployeeIds((prev) =>
      checked ? [...prev, employeeId] : prev.filter((id) => id !== employeeId)
    )
  }

  const toggleCoreMember = (coreMemberId: string, checked: boolean) => {
    setSelectedCoreMemberIds((prev) =>
      checked
        ? [...prev, coreMemberId]
        : prev.filter((id) => id !== coreMemberId)
    )
  }

  const toggleAllFiltered = (checked: boolean) => {
    if (!checked) {
      const filteredIds = new Set(
        filteredAvailableEmployees.map((employee) => employee.id)
      )
      setSelectedEmployeeIds((prev) =>
        prev.filter((id) => !filteredIds.has(id))
      )
      return
    }
    setSelectedEmployeeIds((prev) => [
      ...prev,
      ...filteredAvailableEmployees
        .map((employee) => employee.id)
        .filter((employeeId) => !prev.includes(employeeId)),
    ])
  }

  const toggleAllFilteredCore = (checked: boolean) => {
    if (!checked) {
      const filteredIds = new Set(
        filteredAvailableCoreMembers.map((member) => member.id)
      )
      setSelectedCoreMemberIds((prev) =>
        prev.filter((id) => !filteredIds.has(id))
      )
      return
    }
    setSelectedCoreMemberIds((prev) => [
      ...prev,
      ...filteredAvailableCoreMembers
        .map((member) => member.id)
        .filter((memberId) => !prev.includes(memberId)),
    ])
  }

  return (
    <div>
      <PageHeader
        title={project.name}
        description={`${project.client?.name ?? "Client"} · ${(project.categories ?? []).map((category) => category.name).join(", ") || "No categories"}`}
        breadcrumbs={[
          { label: "Projects", to: "/projects", search: DEFAULT_LIST_SEARCH },
          { label: project.name },
        ]}
        status={
          <>
            <StatusBadge status={project.status} />
            {profit ? (
              <HealthBadge marginPercent={profit.marginPercent} />
            ) : null}
          </>
        }
        actions={
          canManageAssignments ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Project actions"
                  />
                }
              >
                <IconDotsVertical />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-40">
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={openCloseProject}
                  >
                    <IconLock />
                    Close
                  </DropdownMenuItem>
                  {canDeleteProject ? (
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={async () => {
                        const ok = await confirm({
                          title: "Delete project?",
                          description:
                            "This permanently deletes the project, its assignments, and extensions.",
                          confirmLabel: "Delete",
                          destructive: true,
                        })
                        if (!ok) return
                        try {
                          await api(`/projects/${id}`, { method: "DELETE" })
                          void navigate({
                            to: "/projects",
                            search: DEFAULT_LIST_SEARCH,
                          })
                        } catch (e) {
                          alert(
                            e instanceof ApiError ? e.message : "Delete failed"
                          )
                        }
                      }}
                    >
                      <IconTrash />
                      Delete
                    </DropdownMenuItem>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger
                        render={<div className="w-full cursor-not-allowed" />}
                      >
                        <DropdownMenuItem disabled variant="destructive">
                          <IconTrash />
                          Delete
                        </DropdownMenuItem>
                      </TooltipTrigger>
                      <TooltipContent>
                        Cannot delete: stand-ups have been recorded for this
                        project
                      </TooltipContent>
                    </Tooltip>
                  )}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="min-w-0 space-y-6">
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <ProjectMetricCard
              label="Total budget"
              value={
                profit
                  ? formatNpr(profit.revenuePaisa)
                  : formatNpr(project.budgetPaisa)
              }
              hint={
                profit
                  ? `Base ${formatNpr(profit.budgetPaisa)} + ${formatNpr(profit.extensionsPaisa)} extensions`
                  : "Project base budget"
              }
            />
            <ProjectMetricCard
              label="Labor cost accrued"
              value={formatNpr(
                summary?.laborCostPaisa ?? profit?.employeeCostPaisa ?? "0"
              )}
              hint={
                summary
                  ? `${summary.completedStandupCount} completed stand-ups across ${summary.standupEmployeeCount} employees`
                  : "Calculated from completed stand-up allocations"
              }
            />
            <ProjectMetricCard
              label={
                profit && Number(profit.profitLossPaisa) < 0
                  ? "Projected loss"
                  : "Projected profit"
              }
              value={
                profit
                  ? formatNpr(profit.profitLossPaisa, { signed: true })
                  : formatNpr("0")
              }
              hint={
                profit
                  ? `${profit.marginPercent.toFixed(1)}% margin`
                  : "Profitability unavailable"
              }
              valueClassName={
                profit
                  ? Number(profit.profitLossPaisa) >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-destructive"
                  : undefined
              }
            />
            <ProjectMetricCard
              label="Assigned employees"
              value={String(
                summary?.activeEmployeeCount ?? activeAssignments.length
              )}
              hint={`${summary?.employeeAssignmentCount ?? assignments.employees.length} assignment logs retained`}
            />
          </section>

          <Tabs
            value={tab}
            onValueChange={(value) => {
              void navigate({
                search: (prev) => ({
                  ...prev,
                  tab: parseProjectTab(value),
                }),
              })
            }}
          >
            <TabsList>
              <TabsTrigger value="team">Team</TabsTrigger>
              <TabsTrigger value="standups">Stand-ups</TabsTrigger>
              <TabsTrigger value="extensions">Extensions</TabsTrigger>
              <TabsTrigger value="invoices">Invoices</TabsTrigger>
              <TabsTrigger value="amc">AMC</TabsTrigger>
              <TabsTrigger value="labor">Labor</TabsTrigger>
            </TabsList>

            <TabsContent value="team" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-base">
                      Assigned employees
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Active assignments appear above. Historical assignment
                      logs stay preserved below.
                    </p>
                  </div>
                  <Button
                    disabled={availableEmployees.length === 0}
                    onClick={openAddEmployees}
                  >
                    <IconUserPlus className="size-3.5" />
                    Add employees
                  </Button>
                </CardHeader>
                <CardContent className="space-y-5">
                  <Dialog
                    open={employeeAddOpen}
                    onOpenChange={setEmployeeAddOpen}
                  >
                    <DialogContent className="sm:max-w-lg">
                      <DialogHeader>
                        <DialogTitle>Add employees to project</DialogTitle>
                        <DialogDescription>
                          Assigned from is required. Last day assigned is
                          inclusive; leave it blank if they are still on the
                          project
                          {projectNeedsEndDate
                            ? ". Closed projects require a last day."
                            : "."}
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="grid gap-2">
                            <Label htmlFor="employee-assigned-from">
                              Assigned from
                            </Label>
                            <Input
                              id="employee-assigned-from"
                              type="date"
                              required
                              max={todayIso}
                              value={employeeAssignedFrom}
                              onChange={(e) =>
                                setEmployeeAssignedFrom(e.target.value)
                              }
                            />
                            <p className="text-xs text-muted-foreground">
                              Required.
                            </p>
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="employee-last-day">
                              Last day assigned
                            </Label>
                            <Input
                              id="employee-last-day"
                              type="date"
                              required={projectNeedsEndDate}
                              min={employeeAssignedFrom}
                              max={todayIso}
                              value={employeeLastDay}
                              onChange={(e) =>
                                setEmployeeLastDay(e.target.value)
                              }
                            />
                            <p className="text-xs text-muted-foreground">
                              {projectNeedsEndDate
                                ? "Required for closed projects."
                                : "Optional. Omit if still assigned."}
                            </p>
                          </div>
                        </div>
                        <Input
                          value={employeeQuery}
                          onChange={(e) => setEmployeeQuery(e.target.value)}
                          placeholder="Search by name or email…"
                          aria-label="Search employees to add"
                        />
                        {filteredAvailableEmployees.length > 0 ? (
                          <label className="flex items-center gap-2 border-b pb-2 text-sm">
                            <Checkbox
                              checked={allFilteredSelected}
                              onCheckedChange={(checked) =>
                                toggleAllFiltered(Boolean(checked))
                              }
                            />
                            Select all shown (
                            {filteredAvailableEmployees.length})
                          </label>
                        ) : null}
                        <div className="max-h-72 space-y-1 overflow-y-auto">
                          {filteredAvailableEmployees.length === 0 ? (
                            <p className="py-6 text-center text-sm text-muted-foreground">
                              {availableEmployees.length === 0
                                ? "Everyone with an open assignment on this project is already listed above."
                                : "No employees match your search."}
                            </p>
                          ) : (
                            filteredAvailableEmployees.map((employee) => (
                              <label
                                key={employee.id}
                                className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-muted/60"
                              >
                                <Checkbox
                                  checked={selectedEmployeeIds.includes(
                                    employee.id
                                  )}
                                  onCheckedChange={(checked) =>
                                    toggleEmployee(
                                      employee.id,
                                      Boolean(checked)
                                    )
                                  }
                                />
                                <span className="min-w-0">
                                  <span className="flex items-center gap-2">
                                    <span className="block text-sm font-medium">
                                      {employee.name}
                                    </span>
                                    {employee.status === "left" ? (
                                      <Badge variant="outline">Left</Badge>
                                    ) : null}
                                  </span>
                                  <span className="block text-xs text-muted-foreground">
                                    {employee.email}
                                  </span>
                                </span>
                              </label>
                            ))
                          )}
                        </div>
                      </div>
                      <DialogFooter>
                        <Button
                          variant="outline"
                          onClick={() => setEmployeeAddOpen(false)}
                          disabled={addingEmployees}
                        >
                          Cancel
                        </Button>
                        <Button
                          disabled={
                            selectedEmployeeIds.length === 0 || addingEmployees
                          }
                          onClick={async () => {
                            if (!employeeAssignedFrom) {
                              alert("Assigned from date is required")
                              return
                            }
                            if (projectNeedsEndDate && !employeeLastDay) {
                              alert(
                                "Last day assigned is required for closed projects"
                              )
                              return
                            }
                            if (
                              employeeLastDay &&
                              employeeLastDay < employeeAssignedFrom
                            ) {
                              alert(
                                "Last day assigned must be on or after the assigned-from date"
                              )
                              return
                            }
                            setAddingEmployees(true)
                            try {
                              await api(
                                `/projects/${id}/assignments/employees/bulk`,
                                {
                                  method: "POST",
                                  body: {
                                    employeeIds: selectedEmployeeIds,
                                    assignedAt: employeeAssignedFrom,
                                    unassignedAt: employeeLastDay || undefined,
                                  },
                                }
                              )
                              setEmployeeAddOpen(false)
                              setSelectedEmployeeIds([])
                              setEmployeeQuery("")
                              await load()
                            } catch (e) {
                              alert(
                                e instanceof ApiError
                                  ? e.message
                                  : "Failed to add employees"
                              )
                            } finally {
                              setAddingEmployees(false)
                            }
                          }}
                        >
                          {addingEmployees
                            ? "Adding…"
                            : `Add ${selectedEmployeeIds.length || ""} employee${selectedEmployeeIds.length === 1 ? "" : "s"}`.trim()}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  <Dialog
                    open={releaseEmployeeAssignment !== null}
                    onOpenChange={(open) => {
                      if (!open) setReleaseEmployeeAssignment(null)
                    }}
                  >
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Release employee</DialogTitle>
                        <DialogDescription>
                          {releaseEmployeeAssignment
                            ? `Set the last day ${releaseEmployeeAssignment.employee?.name ?? "this employee"} is assigned.`
                            : "Set the last day assigned."}
                        </DialogDescription>
                      </DialogHeader>
                      <form
                        className="space-y-2"
                        onSubmit={async (e) => {
                          e.preventDefault()
                          if (
                            !releaseEmployeeAssignment ||
                            !employeeReleaseDate
                          )
                            return
                          const assignedDay = String(
                            releaseEmployeeAssignment.assignedAt
                          ).slice(0, 10)
                          if (employeeReleaseDate < assignedDay) {
                            alert(
                              "Last day assigned must be on or after the assigned-from date"
                            )
                            return
                          }
                          setReleasingEmployee(true)
                          try {
                            await api(
                              `/projects/${id}/assignments/employees/${releaseEmployeeAssignment.employeeId}`,
                              {
                                method: "DELETE",
                                body: { unassignedAt: employeeReleaseDate },
                              }
                            )
                            setReleaseEmployeeAssignment(null)
                            await load()
                          } catch (err) {
                            alert(
                              err instanceof ApiError
                                ? err.message
                                : "Failed to release employee"
                            )
                          } finally {
                            setReleasingEmployee(false)
                          }
                        }}
                      >
                        <Label htmlFor="employee-release-date">
                          Last day assigned
                        </Label>
                        <Input
                          id="employee-release-date"
                          type="date"
                          required
                          min={
                            releaseEmployeeAssignment
                              ? String(
                                  releaseEmployeeAssignment.assignedAt
                                ).slice(0, 10)
                              : undefined
                          }
                          max={todayIso}
                          value={employeeReleaseDate}
                          onChange={(e) =>
                            setEmployeeReleaseDate(e.target.value)
                          }
                        />
                        <DialogFooter className="pt-2">
                          <Button
                            type="button"
                            variant="outline"
                            disabled={releasingEmployee}
                            onClick={() => setReleaseEmployeeAssignment(null)}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="submit"
                            disabled={releasingEmployee || !employeeReleaseDate}
                          >
                            {releasingEmployee ? "Releasing…" : "Release"}
                          </Button>
                        </DialogFooter>
                      </form>
                    </DialogContent>
                  </Dialog>

                  {activeAssignments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No active employees assigned.
                    </p>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {activeAssignments.map((assignment) => (
                        <Card key={assignment.id} className="border-dashed">
                          <CardContent>
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate font-medium">
                                  <EmployeeLink id={assignment.employeeId}>
                                    {assignment.employee?.name ??
                                      assignment.employeeId}
                                  </EmployeeLink>
                                </p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {assignment.employee?.email ?? "No email"}
                                </p>
                              </div>
                              <Badge variant="secondary">Active</Badge>
                            </div>
                            <p className="mt-3 text-xs text-muted-foreground">
                              Assigned{" "}
                              {String(assignment.assignedAt).slice(0, 10)}
                            </p>
                            <Button
                              variant="outline"
                              size="sm"
                              className="mt-4 w-full"
                              onClick={() => openReleaseEmployee(assignment)}
                            >
                              <IconUserMinus className="size-3.5" />
                              Release
                            </Button>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}

                  <div className="space-y-3">
                    <div>
                      <h3 className="text-sm font-medium">Assignment log</h3>
                      <p className="text-xs text-muted-foreground">
                        Every assignment period is retained, including
                        auto-release on project close.
                      </p>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Assigned</TableHead>
                          <TableHead>Ended</TableHead>
                          <TableActionsHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pagedAssignmentLog.map((assignment) => (
                          <NavigableTableRow
                            key={assignment.id}
                            to="/employees/$id"
                            params={{ id: assignment.employeeId }}
                          >
                            <TableCell>
                              <EmployeeLink id={assignment.employeeId}>
                                {assignment.employee?.name ??
                                  assignment.employeeId}
                              </EmployeeLink>
                            </TableCell>
                            <TableCell>
                              {String(assignment.assignedAt).slice(0, 10)}
                            </TableCell>
                            <TableCell>
                              {assignment.unassignedAt
                                ? String(assignment.unassignedAt).slice(0, 10)
                                : "Present"}
                            </TableCell>
                            <TableActionsCell>
                              <TableActionLink
                                label="View"
                                to="/employees/$id"
                                params={{ id: assignment.employeeId }}
                              >
                                <IconEye className="size-3.5" />
                              </TableActionLink>
                              {!assignment.unassignedAt ? (
                                <TableActionButton
                                  label="Unassign"
                                  variant="destructive"
                                  onClick={() =>
                                    openReleaseEmployee(assignment)
                                  }
                                >
                                  <IconUserMinus className="size-3.5" />
                                </TableActionButton>
                              ) : canDeleteAssignmentLogs ? (
                                <TableActionButton
                                  label="Delete log"
                                  variant="destructive"
                                  onClick={async () => {
                                    const ok = await confirm({
                                      title: "Delete assignment log?",
                                      description: `This removes the ${String(assignment.assignedAt).slice(0, 10)}–${String(assignment.unassignedAt).slice(0, 10)} period for ${assignment.employee?.name ?? "this employee"}. Stand-up history is not deleted.`,
                                      confirmLabel: "Delete",
                                      destructive: true,
                                    })
                                    if (!ok) return
                                    await api(
                                      `/projects/${id}/assignment-logs/employees/${assignment.id}`,
                                      { method: "DELETE" }
                                    )
                                    await load()
                                  }}
                                >
                                  <IconTrash className="size-3.5" />
                                </TableActionButton>
                              ) : null}
                            </TableActionsCell>
                          </NavigableTableRow>
                        ))}
                        {assignmentLog.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={4}
                              className="text-muted-foreground"
                            >
                              No employee assignments yet.
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </TableBody>
                    </Table>
                    {assignmentLog.length > 0 ? (
                      <PaginationBar
                        page={logPageSafe}
                        totalPages={logTotalPages}
                        total={assignmentLog.length}
                        pageSize={logPageSize}
                        onPageChange={setLogPage}
                        onPageSizeChange={(size) => {
                          setLogPageSize(size)
                          setLogPage(1)
                        }}
                      />
                    ) : null}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-base">Core members</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Active assignments appear above. Historical assignment
                      logs stay preserved below. Cost is prorated across
                      concurrent projects while assigned.
                    </p>
                  </div>
                  <Button
                    disabled={availableCoreMembers.length === 0}
                    onClick={openAddCoreMembers}
                  >
                    <IconUserPlus className="size-3.5" />
                    Add core members
                  </Button>
                </CardHeader>
                <CardContent className="space-y-5">
                  <Dialog
                    open={coreMemberAddOpen}
                    onOpenChange={setCoreMemberAddOpen}
                  >
                    <DialogContent className="sm:max-w-lg">
                      <DialogHeader>
                        <DialogTitle>Add core members to project</DialogTitle>
                        <DialogDescription>
                          Assigned from is required. Last day assigned is
                          inclusive; leave it blank if they are still on the
                          project
                          {projectNeedsEndDate
                            ? ". Closed projects require a last day."
                            : "."}
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="grid gap-2">
                            <Label htmlFor="core-assigned-from">
                              Assigned from
                            </Label>
                            <Input
                              id="core-assigned-from"
                              type="date"
                              required
                              max={todayIso}
                              value={coreAssignedFrom}
                              onChange={(e) =>
                                setCoreAssignedFrom(e.target.value)
                              }
                            />
                            <p className="text-xs text-muted-foreground">
                              Required.
                            </p>
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="core-last-day">
                              Last day assigned
                            </Label>
                            <Input
                              id="core-last-day"
                              type="date"
                              required={projectNeedsEndDate}
                              min={coreAssignedFrom}
                              max={todayIso}
                              value={coreLastDay}
                              onChange={(e) => setCoreLastDay(e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">
                              {projectNeedsEndDate
                                ? "Required for closed projects."
                                : "Optional. Omit if still assigned."}
                            </p>
                          </div>
                        </div>
                        <Input
                          value={coreMemberQuery}
                          onChange={(e) => setCoreMemberQuery(e.target.value)}
                          placeholder="Search by name or email…"
                          aria-label="Search core members to add"
                        />
                        {filteredAvailableCoreMembers.length > 0 ? (
                          <label className="flex items-center gap-2 border-b pb-2 text-sm">
                            <Checkbox
                              checked={allFilteredCoreSelected}
                              onCheckedChange={(checked) =>
                                toggleAllFilteredCore(Boolean(checked))
                              }
                            />
                            Select all shown (
                            {filteredAvailableCoreMembers.length})
                          </label>
                        ) : null}
                        <div className="max-h-72 space-y-1 overflow-y-auto">
                          {filteredAvailableCoreMembers.length === 0 ? (
                            <p className="py-6 text-center text-sm text-muted-foreground">
                              {availableCoreMembers.length === 0
                                ? "Everyone with an open assignment on this project is already listed above."
                                : "No core members match your search."}
                            </p>
                          ) : (
                            filteredAvailableCoreMembers.map((member) => (
                              <label
                                key={member.id}
                                className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-muted/60"
                              >
                                <Checkbox
                                  checked={selectedCoreMemberIds.includes(
                                    member.id
                                  )}
                                  onCheckedChange={(checked) =>
                                    toggleCoreMember(
                                      member.id,
                                      Boolean(checked)
                                    )
                                  }
                                />
                                <span className="min-w-0">
                                  <span className="flex items-center gap-2">
                                    <span className="block text-sm font-medium">
                                      {member.name}
                                    </span>
                                    {member.status === "left" ? (
                                      <Badge variant="outline">Left</Badge>
                                    ) : null}
                                  </span>
                                  <span className="block text-xs text-muted-foreground">
                                    {member.email}
                                  </span>
                                </span>
                              </label>
                            ))
                          )}
                        </div>
                      </div>
                      <DialogFooter>
                        <Button
                          variant="outline"
                          onClick={() => setCoreMemberAddOpen(false)}
                          disabled={addingCoreMembers}
                        >
                          Cancel
                        </Button>
                        <Button
                          disabled={
                            selectedCoreMemberIds.length === 0 ||
                            addingCoreMembers
                          }
                          onClick={async () => {
                            if (!coreAssignedFrom) {
                              alert("Assigned from date is required")
                              return
                            }
                            if (projectNeedsEndDate && !coreLastDay) {
                              alert(
                                "Last day assigned is required for closed projects"
                              )
                              return
                            }
                            if (coreLastDay && coreLastDay < coreAssignedFrom) {
                              alert(
                                "Last day assigned must be on or after the assigned-from date"
                              )
                              return
                            }
                            setAddingCoreMembers(true)
                            try {
                              await api(
                                `/projects/${id}/assignments/core-members/bulk`,
                                {
                                  method: "POST",
                                  body: {
                                    coreMemberIds: selectedCoreMemberIds,
                                    assignedAt: coreAssignedFrom,
                                    unassignedAt: coreLastDay || undefined,
                                  },
                                }
                              )
                              setCoreMemberAddOpen(false)
                              setSelectedCoreMemberIds([])
                              setCoreMemberQuery("")
                              await load()
                            } catch (e) {
                              alert(
                                e instanceof ApiError
                                  ? e.message
                                  : "Failed to add core members"
                              )
                            } finally {
                              setAddingCoreMembers(false)
                            }
                          }}
                        >
                          {addingCoreMembers
                            ? "Adding…"
                            : `Add ${selectedCoreMemberIds.length || ""} core member${selectedCoreMemberIds.length === 1 ? "" : "s"}`.trim()}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  <Dialog
                    open={releaseAssignment !== null}
                    onOpenChange={(open) => {
                      if (!open) setReleaseAssignment(null)
                    }}
                  >
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Release core member</DialogTitle>
                        <DialogDescription>
                          {releaseAssignment
                            ? `Set the last day ${releaseAssignment.coreMember?.name ?? "this core member"} is assigned. That day is included in cost.`
                            : "Set the last day assigned. That day is included in cost."}
                        </DialogDescription>
                      </DialogHeader>
                      <form
                        className="space-y-2"
                        onSubmit={async (e) => {
                          e.preventDefault()
                          if (!releaseAssignment || !releaseDate) return
                          const assignedDay = String(
                            releaseAssignment.assignedAt
                          ).slice(0, 10)
                          if (releaseDate < assignedDay) {
                            alert(
                              "Last day assigned must be on or after the assigned-from date"
                            )
                            return
                          }
                          setReleasing(true)
                          try {
                            await api(
                              `/projects/${id}/assignments/core-members/${releaseAssignment.coreMemberId}`,
                              {
                                method: "DELETE",
                                body: { unassignedAt: releaseDate },
                              }
                            )
                            setReleaseAssignment(null)
                            await load()
                          } catch (err) {
                            alert(
                              err instanceof ApiError
                                ? err.message
                                : "Failed to release core member"
                            )
                          } finally {
                            setReleasing(false)
                          }
                        }}
                      >
                        <Label htmlFor="core-release-date">
                          Last day assigned
                        </Label>
                        <Input
                          id="core-release-date"
                          type="date"
                          required
                          min={
                            releaseAssignment
                              ? String(releaseAssignment.assignedAt).slice(
                                  0,
                                  10
                                )
                              : undefined
                          }
                          max={todayIso}
                          value={releaseDate}
                          onChange={(e) => setReleaseDate(e.target.value)}
                        />
                        <DialogFooter className="pt-2">
                          <Button
                            type="button"
                            variant="outline"
                            disabled={releasing}
                            onClick={() => setReleaseAssignment(null)}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="submit"
                            disabled={releasing || !releaseDate}
                          >
                            {releasing ? "Releasing…" : "Release"}
                          </Button>
                        </DialogFooter>
                      </form>
                    </DialogContent>
                  </Dialog>

                  {activeCoreAssignments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No active core members assigned.
                    </p>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {activeCoreAssignments.map((assignment) => (
                        <Card key={assignment.id} className="border-dashed">
                          <CardContent>
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate font-medium">
                                  <CoreMemberLink id={assignment.coreMemberId}>
                                    {assignment.coreMember?.name ??
                                      assignment.coreMemberId}
                                  </CoreMemberLink>
                                </p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {assignment.coreMember?.email ?? "No email"}
                                </p>
                              </div>
                              <Badge variant="secondary">Active</Badge>
                            </div>
                            <p className="mt-3 text-xs text-muted-foreground">
                              Assigned{" "}
                              {String(assignment.assignedAt).slice(0, 10)}
                            </p>
                            <Button
                              variant="outline"
                              size="sm"
                              className="mt-4 w-full"
                              onClick={() => openReleaseCoreMember(assignment)}
                            >
                              <IconUserMinus className="size-3.5" />
                              Release
                            </Button>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}

                  <div className="space-y-3">
                    <div>
                      <h3 className="text-sm font-medium">Assignment log</h3>
                      <p className="text-xs text-muted-foreground">
                        Every assignment period is retained, including
                        auto-release on project close. Releasing ends cost
                        accrual for this project from that day.
                      </p>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Assigned</TableHead>
                          <TableHead>Ended</TableHead>
                          <TableActionsHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pagedCoreAssignmentLog.map((assignment) => (
                          <NavigableTableRow
                            key={assignment.id}
                            to="/core-members/$id"
                            params={{ id: assignment.coreMemberId }}
                          >
                            <TableCell>
                              <CoreMemberLink id={assignment.coreMemberId}>
                                {assignment.coreMember?.name ??
                                  assignment.coreMemberId}
                              </CoreMemberLink>
                            </TableCell>
                            <TableCell>
                              {String(assignment.assignedAt).slice(0, 10)}
                            </TableCell>
                            <TableCell>
                              {assignment.unassignedAt
                                ? String(assignment.unassignedAt).slice(0, 10)
                                : "Present"}
                            </TableCell>
                            <TableActionsCell>
                              <TableActionLink
                                label="View"
                                to="/core-members/$id"
                                params={{ id: assignment.coreMemberId }}
                              >
                                <IconEye className="size-3.5" />
                              </TableActionLink>
                              {!assignment.unassignedAt ? (
                                <TableActionButton
                                  label="Unassign"
                                  variant="destructive"
                                  onClick={() =>
                                    openReleaseCoreMember(assignment)
                                  }
                                >
                                  <IconUserMinus className="size-3.5" />
                                </TableActionButton>
                              ) : canDeleteAssignmentLogs ? (
                                <TableActionButton
                                  label="Delete log"
                                  variant="destructive"
                                  onClick={async () => {
                                    const ok = await confirm({
                                      title: "Delete assignment log?",
                                      description: `This removes the ${String(assignment.assignedAt).slice(0, 10)}–${String(assignment.unassignedAt).slice(0, 10)} period for ${assignment.coreMember?.name ?? "this core member"} and recalculates cost.`,
                                      confirmLabel: "Delete",
                                      destructive: true,
                                    })
                                    if (!ok) return
                                    await api(
                                      `/projects/${id}/assignment-logs/core-members/${assignment.id}`,
                                      { method: "DELETE" }
                                    )
                                    await load()
                                  }}
                                >
                                  <IconTrash className="size-3.5" />
                                </TableActionButton>
                              ) : null}
                            </TableActionsCell>
                          </NavigableTableRow>
                        ))}
                        {coreAssignmentLog.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={4}
                              className="text-muted-foreground"
                            >
                              No core member assignments yet.
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </TableBody>
                    </Table>
                    {coreAssignmentLog.length > 0 ? (
                      <PaginationBar
                        page={coreLogPageSafe}
                        totalPages={coreLogTotalPages}
                        total={coreAssignmentLog.length}
                        pageSize={coreLogPageSize}
                        onPageChange={setCoreLogPage}
                        onPageSizeChange={(size) => {
                          setCoreLogPageSize(size)
                          setCoreLogPage(1)
                        }}
                      />
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="standups" className="mt-4">
              <StandupHistoryView
                q={q}
                employeeIds={employeeIdList}
                projectId={id}
                from={from}
                to={to}
                hideProjectFilter
                onSearchChange={(value) => {
                  void navigate({
                    search: (prev) => ({
                      ...prev,
                      q: value,
                    }),
                  })
                }}
                onEmployeeIdsChange={(ids) => {
                  void navigate({
                    search: (prev) => ({
                      ...prev,
                      employeeIds: ids.join(","),
                    }),
                  })
                }}
                onRangeChange={(nextFrom, nextTo) => {
                  void navigate({
                    search: (prev) => ({
                      ...prev,
                      from: nextFrom,
                      to: nextTo,
                    }),
                  })
                }}
              />
            </TabsContent>

            <TabsContent value="extensions" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
                  <CardTitle className="text-base">Extension history</CardTitle>
                  <Button size="sm" onClick={() => setExtensionOpen(true)}>
                    Add extension
                  </Button>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Reason</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>New end</TableHead>
                        <TableHead>Logged</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(project.extensions ?? []).map((extension) => (
                        <TableRow key={extension.id}>
                          <TableCell>
                            {extension.reason}
                            {extension.isAuto ? " (auto)" : ""}
                          </TableCell>
                          <TableCell>
                            {formatNpr(extension.amountPaisa)}
                          </TableCell>
                          <TableCell>
                            {extension.endDate
                              ? String(extension.endDate).slice(0, 10)
                              : "—"}
                          </TableCell>
                          <TableCell>
                            {String(extension.createdAt).slice(0, 10)}
                          </TableCell>
                        </TableRow>
                      ))}
                      {(project.extensions ?? []).length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={4}
                            className="text-muted-foreground"
                          >
                            No extensions recorded yet.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Dialog
                open={extensionOpen}
                onOpenChange={(open) => {
                  setExtensionOpen(open)
                  if (!open) {
                    setExtReason("")
                    setExtAmount("0")
                    setExtEndDate("")
                  }
                }}
              >
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add extension</DialogTitle>
                  </DialogHeader>
                  <form
                    className="space-y-3"
                    onSubmit={async (e) => {
                      e.preventDefault()
                      await api(`/projects/${id}/extensions`, {
                        method: "POST",
                        body: {
                          reason: extReason.trim(),
                          amountNpr: parseNprInput(extAmount || "0"),
                          endDate: extEndDate,
                        },
                      })
                      setExtReason("")
                      setExtAmount("0")
                      setExtEndDate("")
                      setExtensionOpen(false)
                      await load()
                    }}
                  >
                    <div className="space-y-2">
                      <Label>Reason</Label>
                      <Textarea
                        required
                        value={extReason}
                        onChange={(e) => setExtReason(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Amount (NPR)</Label>
                      <Input
                        value={extAmount}
                        onChange={(e) => setExtAmount(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>New end date</Label>
                      <Input
                        type="date"
                        required
                        min={(() => {
                          const current = new Date(
                            String(project.endDate).slice(0, 10)
                          )
                          current.setUTCDate(current.getUTCDate() + 1)
                          return current.toISOString().slice(0, 10)
                        })()}
                        value={extEndDate}
                        onChange={(e) => setExtEndDate(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Current end date: {String(project.endDate).slice(0, 10)}
                      </p>
                    </div>
                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setExtensionOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" disabled={!extEndDate}>
                        Add extension
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </TabsContent>

            <TabsContent value="invoices" className="mt-4 space-y-4">
              <ProjectInvoicesTab
                project={project}
                canMutate={canManageLinks}
              />
            </TabsContent>

            <TabsContent value="amc" className="mt-4 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-medium text-muted-foreground">
                  Maintenance contracts
                </h2>
                {project.status === "closed" ||
                project.status === "under_amc" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setAmcCreateOpen(true)}
                  >
                    New AMC
                  </Button>
                ) : null}
              </div>
              {project.status !== "closed" && project.status !== "under_amc" ? (
                <Empty className="min-h-64 border bg-card">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <IconLock />
                    </EmptyMedia>
                    <EmptyTitle>AMC unavailable</EmptyTitle>
                    <EmptyDescription>
                      Close the project before setting AMC.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : amcs.length === 0 ? (
                <Empty className="min-h-64 border bg-card">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <IconShieldCheck />
                    </EmptyMedia>
                    <EmptyTitle>No AMC records</EmptyTitle>
                    <EmptyDescription>
                      No maintenance contracts for this project yet.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {amcs.map((amc) => (
                    <AmcCard
                      key={amc.id}
                      amc={{
                        ...amc,
                        projectName: project.name,
                        clientName: project.client?.name,
                      }}
                      onRenew={async (record) => {
                        await api(`/amc/${record.id}/renewal-decision`, {
                          method: "POST",
                          body: { decision: "renewed" },
                        })
                        setAmcCreateOpen(true)
                        await load()
                      }}
                      onDecline={(record) => {
                        setDeclineAmc({
                          ...record,
                          projectName: project.name,
                          clientName: project.client?.name,
                        })
                      }}
                      onEdit={(record) => {
                        setEditAmc({
                          ...record,
                          projectName: project.name,
                          clientName: project.client?.name,
                        })
                      }}
                      canDelete={canDeleteAmc}
                      onDelete={async (record) => {
                        const ok = await confirm({
                          title: "Delete AMC permanently?",
                          description:
                            "This cannot be undone. Prefer decline/cancel when the contract simply ended.",
                          confirmLabel: "Delete",
                          destructive: true,
                        })
                        if (!ok) return
                        try {
                          await api(`/amc/${record.id}`, { method: "DELETE" })
                          await load()
                        } catch (e) {
                          alert(
                            e instanceof ApiError
                              ? e.message
                              : "Failed to delete AMC"
                          )
                        }
                      }}
                    />
                  ))}
                </div>
              )}
              <CreateAmcDialog
                open={amcCreateOpen}
                onOpenChange={setAmcCreateOpen}
                presetProjectId={id}
                lockProject
                onCreated={() => void load()}
              />
              <EditAmcDialog
                amc={editAmc}
                open={Boolean(editAmc)}
                onOpenChange={(open) => {
                  if (!open) setEditAmc(null)
                }}
                onUpdated={() => void load()}
              />
              <DeclineAmcDialog
                amc={declineAmc}
                open={Boolean(declineAmc)}
                onOpenChange={(open) => {
                  if (!open) setDeclineAmc(null)
                }}
                onConfirm={async (remark) => {
                  if (!declineAmc) return
                  await api(`/amc/${declineAmc.id}/renewal-decision`, {
                    method: "POST",
                    body: {
                      decision: "declined",
                      ...(remark ? { remark } : {}),
                    },
                  })
                  setDeclineAmc(null)
                  await load()
                }}
              />
            </TabsContent>

            <TabsContent value="labor" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Labor cost from stand-ups
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Stand-up labor against the duration-based budget run-rate.
                  </p>
                </CardHeader>
                <CardContent>
                  <ProjectLaborCostChart
                    series={laborSeries}
                    startDate={String(project.startDate).slice(0, 10)}
                    endDate={String(project.endDate).slice(0, 10)}
                    totalBudgetPaisa={
                      profit?.revenuePaisa ?? project.budgetPaisa
                    }
                    spentLaborPaisa={summary?.laborCostPaisa ?? "0"}
                  />
                  <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">
                      {summary?.completedStandupCount ?? 0} completed stand-ups
                    </Badge>
                    <Badge variant="outline">
                      {summary?.standupEmployeeCount ?? 0} employees logged
                    </Badge>
                    <Badge variant="outline">
                      {summary?.allocationPercentTotal ?? 0}% total allocation
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <aside className="lg:sticky lg:top-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">Project details</CardTitle>
              <TableActionLink
                label="Edit details"
                to="/projects/$id/edit"
                params={{ id }}
              >
                <IconPencil className="size-3.5" />
              </TableActionLink>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <Detail
                label="Client"
                value={
                  project.client ? (
                    <Link
                      to="/clients/$id"
                      params={{ id: project.client.id }}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {project.client.name}
                    </Link>
                  ) : (
                    "—"
                  )
                }
              />
              <Detail
                label="Categories"
                value={
                  (project.categories ?? []).length > 0 ? (
                    <span className="flex flex-wrap gap-x-2 gap-y-1">
                      {(project.categories ?? []).map((category) => (
                        <Link
                          key={category.id}
                          to="/categories/$id"
                          params={{ id: category.id }}
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          {category.name}
                        </Link>
                      ))}
                    </span>
                  ) : (
                    "—"
                  )
                }
              />
              <Detail
                label="Base budget"
                value={formatNpr(project.budgetPaisa)}
              />
              <Detail
                label="VAT"
                value={
                  project.isVatApplicable
                    ? `Yes (${project.vatRateApplied}%)`
                    : "No"
                }
              />
              <Detail
                label="Total incl. VAT"
                value={
                  profit
                    ? formatNpr(
                        String(Number(profit.revenuePaisa) + vatAmountPaisa)
                      )
                    : formatNpr(project.budgetPaisa)
                }
              />
              <Detail
                label="Start date"
                value={String(project.startDate).slice(0, 10)}
              />
              <Detail
                label="End date"
                value={String(project.endDate).slice(0, 10)}
              />
              <Detail
                label="Core members"
                value={String(
                  summary?.activeCoreMemberCount ?? assignedCoreMemberIds.size
                )}
              />
              <Detail
                label="Extensions"
                value={`${summary?.extensionCount ?? project.extensions?.length ?? 0} total`}
              />
              <div className="min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-xs tracking-wide text-muted-foreground uppercase">
                    Project links
                  </dt>
                  {canManageLinks ? (
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Add project link"
                      onClick={openCreateLink}
                    >
                      <IconPlus className="size-3.5" />
                    </Button>
                  ) : null}
                </div>
                {(project.links ?? []).length === 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    No project links
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {(project.links ?? []).map((link) => (
                      <li
                        key={link.id}
                        className="flex items-start justify-between gap-2 rounded-md border p-2"
                      >
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-w-0 truncate font-medium text-primary underline-offset-4 hover:underline"
                        >
                          {link.label}
                        </a>
                        {canManageLinks ? (
                          <div className="flex shrink-0 items-center gap-0.5">
                            <TableActionButton
                              label="Edit project link"
                              onClick={() => openEditLink(link)}
                            >
                              <IconPencil className="size-3.5" />
                            </TableActionButton>
                            <TableActionButton
                              label="Delete project link"
                              variant="destructive"
                              onClick={async () => {
                                const ok = await confirm({
                                  title: "Delete project link?",
                                  description: `${link.label} will be removed from this project.`,
                                  confirmLabel: "Delete",
                                  destructive: true,
                                })
                                if (!ok) return
                                await api(`/projects/${id}/links/${link.id}`, {
                                  method: "DELETE",
                                })
                                await load()
                              }}
                            >
                              <IconTrash className="size-3.5" />
                            </TableActionButton>
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
      {dialog}
      <Dialog
        open={linkOpen}
        onOpenChange={(open) => {
          setLinkOpen(open)
          if (!open) setEditingLink(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingLink ? "Edit project link" : "Add project link"}
            </DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={async (event) => {
              event.preventDefault()
              const label = linkForm.label.trim()
              const url = linkForm.url.trim()
              if (!label) {
                alert("Label is required")
                return
              }
              if (!isHttpUrl(url)) {
                alert("URL must start with http:// or https://")
                return
              }
              setSavingLink(true)
              try {
                const body = { label, url }
                if (editingLink) {
                  await api(`/projects/${id}/links/${editingLink.id}`, {
                    method: "PATCH",
                    body,
                  })
                } else {
                  await api(`/projects/${id}/links`, {
                    method: "POST",
                    body,
                  })
                }
                setLinkOpen(false)
                setEditingLink(null)
                await load()
              } catch (caughtError) {
                alert(
                  caughtError instanceof ApiError
                    ? caughtError.message
                    : "Failed to save project link"
                )
              } finally {
                setSavingLink(false)
              }
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="project-link-label">Label</Label>
              <Input
                id="project-link-label"
                required
                maxLength={200}
                value={linkForm.label}
                onChange={(event) =>
                  setLinkForm((form) => ({
                    ...form,
                    label: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-link-url">URL</Label>
              <Input
                id="project-link-url"
                type="url"
                required
                maxLength={2048}
                placeholder="https://"
                value={linkForm.url}
                onChange={(event) =>
                  setLinkForm((form) => ({
                    ...form,
                    url: event.target.value,
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">
                Must be an http or https URL. Opens in a new tab.
              </p>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={savingLink}
                onClick={() => setLinkOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={savingLink}>
                {savingLink
                  ? "Saving…"
                  : editingLink
                    ? "Save link"
                    : "Add link"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Close project?</DialogTitle>
            <DialogDescription>
              Closing ends all active employee and core member assignments on
              the close date (inclusive) and keeps assignment history.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={async (event) => {
              event.preventDefault()
              if (!closeDate || closeBlockedReason) return
              setClosing(true)
              try {
                await api(`/projects/${id}/close`, {
                  method: "POST",
                  body: { closeDate },
                })
                setCloseOpen(false)
                await load()
              } catch (err) {
                alert(
                  err instanceof ApiError
                    ? err.message
                    : "Failed to close project",
                )
              } finally {
                setClosing(false)
              }
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="project-close-date">Close date</Label>
              <Input
                id="project-close-date"
                type="date"
                required
                min={minCloseDate > todayIso ? undefined : minCloseDate}
                max={todayIso}
                value={closeDate}
                onChange={(event) => setCloseDate(event.target.value)}
              />
              {latestAssignmentEnd ? (
                <p className="text-xs text-muted-foreground">
                  Cannot be before {latestAssignmentEnd}, the latest assignment
                  end date.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Cannot be before the project start date
                  {latestOpenAssignedFrom
                    ? ` or an active assignment start (${latestOpenAssignedFrom})`
                    : ""}
                  .
                </p>
              )}
              {wasAutoExtended ? (
                <p className="text-xs text-muted-foreground">
                  This project was auto-extended. Closing will remove that auto
                  extension.
                </p>
              ) : null}
              {hasManualExtension ? (
                <p className="text-xs text-muted-foreground">
                  This project has a manual extension until {projectEndDay}.
                  Close date cannot be before that date.
                </p>
              ) : null}
              {closeBlockedReason ? (
                <p className="text-sm text-destructive">{closeBlockedReason}</p>
              ) : null}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={closing}
                onClick={() => setCloseOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={closing || !closeDate || Boolean(closeBlockedReason)}
              >
                {closing ? "Closing…" : "Close project"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ProjectMetricCard({
  label,
  value,
  hint,
  valueClassName,
}: {
  label: string
  value: string
  hint: string
  valueClassName?: string
}) {
  return (
    <Card size="sm">
      <CardContent>
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
            {label}
          </p>
        </div>
        <p
          className={`text-2xl font-semibold tabular-nums ${valueClassName ?? ""}`}
        >
          {value}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  )
}

function ProjectLaborCostChart({
  series,
  startDate,
  endDate,
  totalBudgetPaisa,
  spentLaborPaisa,
}: {
  series: Array<{
    date: string
    laborCostPaisa: string
    allocationPercentTotal: number
    standupCount: number
    employeeCount: number
  }>
  startDate: string
  endDate: string
  totalBudgetPaisa: string
  spentLaborPaisa: string
}) {
  const [grain, setGrain] = React.useState<LaborGrain>("monthly")
  const durationMonths = inclusiveMonthCount(startDate, endDate)
  const periodBudgetPaisa = periodBudgetForGrain(
    Number(totalBudgetPaisa) || 0,
    durationMonths,
    grain
  )
  const spent = Number(spentLaborPaisa) || 0
  const totalBudget = Number(totalBudgetPaisa) || 0
  const burn = totalBudget > 0 ? Math.min(100, (spent / totalBudget) * 100) : 0

  const chartConfig = {
    laborCost: {
      label: "Labor cost",
      color: "orange",
    },
    budget: {
      label: "Period budget",
      color: "var(--chart-2)",
    },
  } satisfies ChartConfig

  const data = React.useMemo(
    () =>
      buildLaborChartData({
        series,
        startDate,
        endDate,
        grain,
        periodBudgetPaisa,
      }),
    [series, startDate, endDate, grain, periodBudgetPaisa]
  )

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ToggleGroup
          value={[grain]}
          onValueChange={(next) => {
            const selected = next[0]
            if (
              selected === "daily" ||
              selected === "weekly" ||
              selected === "monthly" ||
              selected === "annually"
            ) {
              setGrain(selected)
            }
          }}
          variant="outline"
          size="sm"
          spacing={0}
          className="flex-wrap"
        >
          <ToggleGroupItem value="daily">Daily</ToggleGroupItem>
          <ToggleGroupItem value="weekly">Weekly</ToggleGroupItem>
          <ToggleGroupItem value="monthly">Monthly</ToggleGroupItem>
          <ToggleGroupItem value="annually">Annually</ToggleGroupItem>
        </ToggleGroup>
        <Badge variant="outline">{burn.toFixed(0)}% budget burned</Badge>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {grainLabel(grain)} budget{" "}
        {formatNpr(String(Math.round(periodBudgetPaisa)))} · {durationMonths}{" "}
        month{durationMonths === 1 ? "" : "s"} duration
      </p>
      {data.length === 0 ? (
        <div className="mt-4 flex h-70 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
          No completed stand-up allocations yet.
        </div>
      ) : (
        <ChartContainer
          config={chartConfig}
          className="mt-4 aspect-auto h-70 w-full"
        >
          <AreaChart
            data={data}
            margin={{ left: 0, right: 12, top: 8, bottom: 8 }}
          >
            <defs>
              <linearGradient
                id="project-labor-fill"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="5%"
                  stopColor="var(--color-laborCost)"
                  stopOpacity={0.35}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-laborCost)"
                  stopOpacity={0.02}
                />
              </linearGradient>
              <linearGradient
                id="project-budget-fill"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="5%"
                  stopColor="var(--color-budget)"
                  stopOpacity={0.2}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-budget)"
                  stopOpacity={0.02}
                />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11 }}
              tickFormatter={(value: number) =>
                Math.abs(value) >= 1000
                  ? `${Math.round(value / 1000)}k`
                  : String(Math.round(value))
              }
              width={52}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(_value, _name, item) => {
                    const payload = item?.payload as LaborChartPoint | undefined
                    if (!payload) return null
                    return (
                      <div className="grid gap-1">
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-muted-foreground">
                            Labor cost
                          </span>
                          <span className="font-medium">
                            {formatNpr(
                              String(Math.round(payload.laborCost * 100))
                            )}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-muted-foreground">
                            Period budget
                          </span>
                          <span className="font-medium">
                            {formatNpr(
                              String(Math.round(payload.budget * 100))
                            )}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-muted-foreground">
                            Allocations
                          </span>
                          <span className="font-medium">
                            {payload.allocationPercentTotal}%
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-muted-foreground">
                            Stand-ups
                          </span>
                          <span className="font-medium">
                            {payload.standupCount}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-muted-foreground">
                            Employees
                          </span>
                          <span className="font-medium">
                            {payload.employeeCount}
                          </span>
                        </div>
                      </div>
                    )
                  }}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Area
              type="monotone"
              dataKey="budget"
              name="Period budget"
              stroke="var(--color-budget)"
              fill="url(#project-budget-fill)"
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="laborCost"
              name="Labor cost"
              stroke="var(--color-laborCost)"
              fill="url(#project-labor-fill)"
              strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>
      )}
      <Progress value={burn} className="mt-4 h-2" />
      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
        <span>Spent {formatNpr(spentLaborPaisa)}</span>
        <span>Budget {formatNpr(totalBudgetPaisa)}</span>
      </div>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium">{value}</dd>
    </div>
  )
}

type LaborGrain = "daily" | "weekly" | "monthly" | "annually"

type LaborChartPoint = {
  key: string
  label: string
  laborCost: number
  budget: number
  allocationPercentTotal: number
  standupCount: number
  employeeCount: number
}

function grainLabel(grain: LaborGrain) {
  if (grain === "daily") return "Daily"
  if (grain === "weekly") return "Weekly"
  if (grain === "monthly") return "Monthly"
  return "Annual"
}

function inclusiveMonthCount(startDate: string, endDate: string) {
  const start = parseUtcDate(startDate)
  const end = parseUtcDate(endDate)
  if (!start || !end) return 1
  const months =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - start.getUTCMonth()) +
    1
  return Math.max(1, months)
}

function periodBudgetForGrain(
  totalBudgetPaisa: number,
  durationMonths: number,
  grain: LaborGrain
) {
  const months = Math.max(1, durationMonths)
  const monthly = totalBudgetPaisa / months
  if (grain === "monthly") return monthly
  if (grain === "weekly") return monthly / 4
  if (grain === "daily") return monthly / 4 / 7
  return monthly * 12
}

function parseUtcDate(value: string) {
  const key = String(value).slice(0, 10)
  const date = new Date(`${key}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

function addUtcDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000)
}

function isoWeekStart(date: Date) {
  const day = date.getUTCDay() || 7
  return addUtcDays(date, 1 - day)
}

function isoWeekKey(date: Date) {
  const monday = isoWeekStart(date)
  const thursday = addUtcDays(monday, 3)
  const year = thursday.getUTCFullYear()
  const week1Monday = isoWeekStart(new Date(Date.UTC(year, 0, 4)))
  const week =
    Math.floor((monday.getTime() - week1Monday.getTime()) / (7 * 86_400_000)) +
    1
  return `${year}-W${String(week).padStart(2, "0")}`
}

function periodKeyForDate(date: Date, grain: LaborGrain) {
  const iso = date.toISOString().slice(0, 10)
  if (grain === "daily") return iso
  if (grain === "weekly") return isoWeekKey(date)
  if (grain === "monthly") return iso.slice(0, 7)
  return String(date.getUTCFullYear())
}

function formatPeriodLabel(key: string, grain: LaborGrain) {
  if (grain === "daily") {
    return formatUtcLabel(key, { day: "numeric", month: "short" })
  }
  if (grain === "weekly") {
    const year = Number(key.slice(0, 4))
    const week = Number(key.slice(6))
    const jan4 = new Date(Date.UTC(year, 0, 4))
    const weekStart = addUtcDays(isoWeekStart(jan4), (week - 1) * 7)
    return `W${String(week).padStart(2, "0")} ${formatUtcLabel(weekStart.toISOString().slice(0, 10), { day: "numeric", month: "short" })}`
  }
  if (grain === "monthly") {
    return formatUtcLabel(`${key}-01`, { month: "short", year: "2-digit" })
  }
  return key
}

function formatUtcLabel(isoDate: string, options: Intl.DateTimeFormatOptions) {
  const date = parseUtcDate(isoDate)
  if (!date) return isoDate
  return new Intl.DateTimeFormat("en-US", {
    ...options,
    timeZone: "UTC",
  }).format(date)
}

function buildLaborChartData({
  series,
  startDate,
  endDate,
  grain,
  periodBudgetPaisa,
}: {
  series: Array<{
    date: string
    laborCostPaisa: string
    allocationPercentTotal: number
    standupCount: number
    employeeCount: number
  }>
  startDate: string
  endDate: string
  grain: LaborGrain
  periodBudgetPaisa: number
}): LaborChartPoint[] {
  const byDate = new Map(series.map((item) => [item.date.slice(0, 10), item]))
  const start = parseUtcDate(startDate)
  const projectEnd = parseUtcDate(endDate)
  if (!start || !projectEnd) return []

  const today =
    parseUtcDate(new Date().toISOString().slice(0, 10)) ?? projectEnd
  const lastSeriesDate = series.reduce((latest, item) => {
    return item.date > latest ? item.date : latest
  }, startDate)
  const lastDate = parseUtcDate(lastSeriesDate) ?? start
  const rangeEndMs = Math.max(
    Math.min(today.getTime(), projectEnd.getTime()),
    lastDate.getTime()
  )

  const buckets = new Map<
    string,
    {
      laborCostPaisa: number
      allocationPercentTotal: number
      standupIds: number
      employeeIds: number
    }
  >()

  for (
    let cursor = start;
    cursor.getTime() <= rangeEndMs;
    cursor = addUtcDays(cursor, 1)
  ) {
    const key = periodKeyForDate(cursor, grain)
    if (!buckets.has(key)) {
      buckets.set(key, {
        laborCostPaisa: 0,
        allocationPercentTotal: 0,
        standupIds: 0,
        employeeIds: 0,
      })
    }
    const iso = cursor.toISOString().slice(0, 10)
    const point = byDate.get(iso)
    if (!point) continue
    const bucket = buckets.get(key)!
    bucket.laborCostPaisa += Number(point.laborCostPaisa) || 0
    bucket.allocationPercentTotal += point.allocationPercentTotal
    bucket.standupIds += point.standupCount
    bucket.employeeIds += point.employeeCount
  }

  const budgetNpr = paisaToNpr(periodBudgetPaisa)
  return [...buckets.entries()].map(([key, bucket]) => ({
    key,
    label: formatPeriodLabel(key, grain),
    laborCost: paisaToNpr(bucket.laborCostPaisa),
    budget: budgetNpr,
    allocationPercentTotal: bucket.allocationPercentTotal,
    standupCount: bucket.standupIds,
    employeeCount: bucket.employeeIds,
  }))
}
