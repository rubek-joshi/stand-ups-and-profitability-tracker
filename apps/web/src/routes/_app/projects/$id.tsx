import * as React from "react"
import { Link, createFileRoute } from "@tanstack/react-router"
import {
  IconCalendarStats,
  IconTrendingUp,
  IconUserMinus,
  IconUserPlus,
  IconUsers,
  IconWallet,
} from "@tabler/icons-react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { Badge } from "@workspace/ui/components/badge"
import { Button, buttonVariants } from "@workspace/ui/components/button"
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Progress } from "@workspace/ui/components/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Textarea } from "@workspace/ui/components/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
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
import { HealthBadge, StatusBadge } from "@/components/health-badge"
import { PageHeader } from "@/components/page-header"
import { PaginationBar } from "@/components/pagination-bar"
import { CoreMemberLink, EmployeeLink } from "@/components/resource-link"
import {
  TableActionButton,
  TableActionsCell,
  TableActionsHead,
} from "@/components/table-row-actions"
import { useConfirmDialog } from "@/components/confirm-dialog"
import { ErrorState, LoadingState } from "@/components/ui-states"
import { api, ApiError, type Envelope } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { DEFAULT_LIST_SEARCH, clampPage, totalPagesFor, type PageSize } from "@/lib/list-query"
import { formatNpr, paisaToNpr, parseNprInput } from "@/lib/money"
import type {
  AmcRecord,
  CoreMember,
  CoreMemberAssignment,
  Employee,
  Project,
  ProjectAssignment,
} from "@/lib/types"

export const Route = createFileRoute("/_app/projects/$id")({
  component: ProjectDetailPage,
})

function ProjectDetailPage() {
  const { id } = Route.useParams()
  const { user } = useAuth()
  const { confirm, dialog } = useConfirmDialog()
  const canDeleteAmc = user?.role === "super_admin"
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
  const [tab, setTab] = React.useState("team")
  const [extReason, setExtReason] = React.useState("")
  const [extAmount, setExtAmount] = React.useState("0")
  const [extEndDate, setExtEndDate] = React.useState("")
  const [coreMemberId, setCoreMemberId] = React.useState("")
  const [employeeAddOpen, setEmployeeAddOpen] = React.useState(false)
  const [employeeQuery, setEmployeeQuery] = React.useState("")
  const [selectedEmployeeIds, setSelectedEmployeeIds] = React.useState<string[]>([])
  const [addingEmployees, setAddingEmployees] = React.useState(false)
  const [amcCreateOpen, setAmcCreateOpen] = React.useState(false)
  const [declineAmc, setDeclineAmc] = React.useState<AmcRecord | null>(null)
  const [editAmc, setEditAmc] = React.useState<AmcRecord | null>(null)
  const [logPage, setLogPage] = React.useState(1)
  const [logPageSize, setLogPageSize] = React.useState<PageSize>(10)
  const initialLoad = React.useRef(true)

  const load = React.useCallback(async () => {
    if (initialLoad.current) setLoading(true)
    setError(null)
    try {
      const [p, a, emps, cores] = await Promise.all([
        api<Envelope<Project>>(`/projects/${id}`),
        api<Envelope<{ employees: ProjectAssignment[]; coreMembers: CoreMemberAssignment[] }>>(
          `/projects/${id}/assignments`,
        ),
        api<Envelope<Employee[]>>("/employees"),
        api<Envelope<CoreMember[]>>("/core-members"),
      ])
      setProject(p.data)
      setAssignments(a.data)
      setEmployees(emps.data.filter((employee) => employee.status === "active"))
      setCoreMembers(cores.data.filter((member) => member.status === "active"))
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
  const assignedEmployeeIds = new Set(
    assignments.employees.filter((assignment) => !assignment.unassignedAt).map((assignment) => assignment.employeeId),
  )
  const assignedCoreMemberIds = new Set(
    assignments.coreMembers
      .filter((assignment) => !assignment.unassignedAt)
      .map((assignment) => assignment.coreMemberId),
  )
  const activeAssignments = assignments.employees.filter((assignment) => !assignment.unassignedAt)
  const availableEmployees = employees.filter((employee) => !assignedEmployeeIds.has(employee.id))
  const availableCoreMembers = coreMembers.filter((member) => !assignedCoreMemberIds.has(member.id))
  const filteredAvailableEmployees = availableEmployees.filter((employee) => {
    const query = employeeQuery.trim().toLowerCase()
    if (!query) return true
    return (
      employee.name.toLowerCase().includes(query) ||
      employee.email.toLowerCase().includes(query)
    )
  })
  const allFilteredSelected =
    filteredAvailableEmployees.length > 0 &&
    filteredAvailableEmployees.every((employee) => selectedEmployeeIds.includes(employee.id))
  const vatAmountPaisa =
    project.isVatApplicable && profit
      ? Math.round((Number(profit.revenuePaisa) * (project.vatRateApplied ?? 0)) / 100)
      : 0
  const assignmentLog = assignments.employees
  const logTotalPages = totalPagesFor(assignmentLog.length, logPageSize)
  const logPageSafe = clampPage(logPage, logTotalPages)
  const pagedAssignmentLog = assignmentLog.slice(
    (logPageSafe - 1) * logPageSize,
    logPageSafe * logPageSize,
  )

  const openAddEmployees = () => {
    setEmployeeQuery("")
    setSelectedEmployeeIds([])
    setEmployeeAddOpen(true)
  }

  const toggleEmployee = (employeeId: string, checked: boolean) => {
    setSelectedEmployeeIds((prev) =>
      checked ? [...prev, employeeId] : prev.filter((id) => id !== employeeId),
    )
  }

  const toggleAllFiltered = (checked: boolean) => {
    if (!checked) {
      const filteredIds = new Set(filteredAvailableEmployees.map((employee) => employee.id))
      setSelectedEmployeeIds((prev) => prev.filter((id) => !filteredIds.has(id)))
      return
    }
    setSelectedEmployeeIds((prev) => [
      ...prev,
      ...filteredAvailableEmployees
        .map((employee) => employee.id)
        .filter((employeeId) => !prev.includes(employeeId)),
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
        actions={
          <>
            <StatusBadge status={project.status} />
            {profit ? <HealthBadge marginPercent={profit.marginPercent} /> : null}
            <Link
              to="/projects/$id/edit"
              params={{ id }}
              className={buttonVariants({ variant: "outline" })}
            >
              Edit
            </Link>
            {canManageAssignments ? (
              <Button
                variant="outline"
                onClick={async () => {
                  const ok = await confirm({
                    title: "Close project?",
                    description:
                      "Closing the project will end all active employee assignments and preserve their history logs.",
                    confirmLabel: "Close project",
                    destructive: true,
                  })
                  if (!ok) return
                  await api(`/projects/${id}/close`, { method: "POST" })
                  await load()
                }}
              >
                Close
              </Button>
            ) : null}
          </>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ProjectMetricCard
          label="Total budget"
          value={profit ? formatNpr(profit.revenuePaisa) : formatNpr(project.budgetPaisa)}
          hint={
            profit
              ? `Base ${formatNpr(profit.budgetPaisa)} + ${formatNpr(profit.extensionsPaisa)} extensions`
              : "Project base budget"
          }
          icon={IconWallet}
        />
        <ProjectMetricCard
          label="Labor cost accrued"
          value={formatNpr(summary?.laborCostPaisa ?? profit?.employeeCostPaisa ?? "0")}
          hint={
            summary
              ? `${summary.completedStandupCount} completed stand-ups across ${summary.standupEmployeeCount} employees`
              : "Calculated from completed stand-up allocations"
          }
          icon={IconCalendarStats}
        />
        <ProjectMetricCard
          label={
            profit && Number(profit.profitLossPaisa) < 0 ? "Projected loss" : "Projected profit"
          }
          value={profit ? formatNpr(profit.profitLossPaisa, { signed: true }) : formatNpr("0")}
          hint={profit ? `${profit.marginPercent.toFixed(1)}% margin` : "Profitability unavailable"}
          icon={IconTrendingUp}
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
          value={String(summary?.activeEmployeeCount ?? activeAssignments.length)}
          hint={`${summary?.employeeAssignmentCount ?? assignments.employees.length} assignment logs retained`}
          icon={IconUsers}
        />
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <CardTitle className="text-lg">Labor cost from stand-ups</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Stand-up labor against the duration-based budget run-rate.
                </p>
              </div>
            </CardHeader>
            <CardContent>
              <ProjectLaborCostChart
                series={laborSeries}
                startDate={String(project.startDate).slice(0, 10)}
                endDate={String(project.endDate).slice(0, 10)}
                totalBudgetPaisa={profit?.revenuePaisa ?? project.budgetPaisa}
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

          <Tabs value={tab} onValueChange={(value) => setTab(String(value))}>
            <TabsList>
              <TabsTrigger value="team">Team</TabsTrigger>
              <TabsTrigger value="extensions">Extensions</TabsTrigger>
              <TabsTrigger value="amc">AMC</TabsTrigger>
            </TabsList>

            <TabsContent value="team" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-base">Assigned employees</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Active assignments appear above. Historical assignment logs stay preserved below.
                </p>
              </div>
              <Button
                disabled={!canManageAssignments || availableEmployees.length === 0}
                onClick={openAddEmployees}
              >
                <IconUserPlus className="size-3.5" />
                Add employees
              </Button>
            </CardHeader>
            <CardContent className="space-y-5">
              <Dialog open={employeeAddOpen} onOpenChange={setEmployeeAddOpen}>
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Add employees to project</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
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
                          onCheckedChange={(checked) => toggleAllFiltered(Boolean(checked))}
                        />
                        Select all shown ({filteredAvailableEmployees.length})
                      </label>
                    ) : null}
                    <div className="max-h-72 space-y-1 overflow-y-auto">
                      {filteredAvailableEmployees.length === 0 ? (
                        <p className="py-6 text-center text-sm text-muted-foreground">
                          {availableEmployees.length === 0
                            ? "All active employees are already assigned to this project."
                            : "No employees match your search."}
                        </p>
                      ) : (
                        filteredAvailableEmployees.map((employee) => (
                          <label
                            key={employee.id}
                            className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-muted/60"
                          >
                            <Checkbox
                              checked={selectedEmployeeIds.includes(employee.id)}
                              onCheckedChange={(checked) =>
                                toggleEmployee(employee.id, Boolean(checked))
                              }
                            />
                            <span className="min-w-0">
                              <span className="block text-sm font-medium">{employee.name}</span>
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
                      disabled={selectedEmployeeIds.length === 0 || addingEmployees}
                      onClick={async () => {
                        setAddingEmployees(true)
                        try {
                          await api(`/projects/${id}/assignments/employees/bulk`, {
                            method: "POST",
                            body: { employeeIds: selectedEmployeeIds },
                          })
                          setEmployeeAddOpen(false)
                          setSelectedEmployeeIds([])
                          setEmployeeQuery("")
                          await load()
                        } catch (e) {
                          alert(e instanceof ApiError ? e.message : "Failed to add employees")
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

              {activeAssignments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active employees assigned.</p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {activeAssignments.map((assignment) => (
                    <Card key={assignment.id} className="border-dashed">
                      <CardContent className="pt-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-medium">
                              <EmployeeLink id={assignment.employeeId}>
                                {assignment.employee?.name ?? assignment.employeeId}
                              </EmployeeLink>
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {assignment.employee?.email ?? "No email"}
                            </p>
                          </div>
                          <Badge variant="secondary">Active</Badge>
                        </div>
                        <p className="mt-3 text-xs text-muted-foreground">
                          Assigned {String(assignment.assignedAt).slice(0, 10)}
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-4 w-full"
                          onClick={async () => {
                            await api(`/projects/${id}/assignments/employees/${assignment.employeeId}`, {
                              method: "DELETE",
                            })
                            await load()
                          }}
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
                    Every assignment period is retained, including auto-release on project close.
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
                      <TableRow key={assignment.id}>
                        <TableCell>
                          <EmployeeLink id={assignment.employeeId}>
                            {assignment.employee?.name ?? assignment.employeeId}
                          </EmployeeLink>
                        </TableCell>
                        <TableCell>{String(assignment.assignedAt).slice(0, 10)}</TableCell>
                        <TableCell>
                          {assignment.unassignedAt
                            ? String(assignment.unassignedAt).slice(0, 10)
                            : "Present"}
                        </TableCell>
                        <TableActionsCell>
                          {!assignment.unassignedAt ? (
                            <TableActionButton
                              label="Unassign"
                              variant="destructive"
                              onClick={async () => {
                                await api(`/projects/${id}/assignments/employees/${assignment.employeeId}`, {
                                  method: "DELETE",
                                })
                                await load()
                              }}
                            >
                              <IconUserMinus className="size-3.5" />
                            </TableActionButton>
                          ) : null}
                        </TableActionsCell>
                      </TableRow>
                    ))}
                    {assignmentLog.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-muted-foreground">
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
            <CardHeader>
              <CardTitle className="text-base">Core members</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Select
                  value={coreMemberId || null}
                  onValueChange={(value) => setCoreMemberId(value ?? "")}
                  items={Object.fromEntries(availableCoreMembers.map((member) => [member.id, member.name]))}
                  disabled={!canManageAssignments || availableCoreMembers.length === 0}
                >
                  <SelectTrigger className="w-72">
                    <SelectValue
                      placeholder={
                        availableCoreMembers.length === 0
                          ? "All core members assigned"
                          : "Assign core member"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {availableCoreMembers.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  disabled={!coreMemberId || !canManageAssignments}
                  onClick={async () => {
                    await api(`/projects/${id}/assignments/core-members`, {
                      method: "POST",
                      body: { coreMemberId },
                    })
                    setCoreMemberId("")
                    await load()
                  }}
                >
                  Assign
                </Button>
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
                  {assignments.coreMembers.map((assignment) => (
                    <TableRow key={assignment.id}>
                      <TableCell>
                        <CoreMemberLink id={assignment.coreMemberId}>
                          {assignment.coreMember?.name ?? assignment.coreMemberId}
                        </CoreMemberLink>
                      </TableCell>
                      <TableCell>{String(assignment.assignedAt).slice(0, 10)}</TableCell>
                      <TableCell>
                        {assignment.unassignedAt
                          ? String(assignment.unassignedAt).slice(0, 10)
                          : "Present"}
                      </TableCell>
                      <TableActionsCell>
                        {!assignment.unassignedAt ? (
                          <TableActionButton
                            label="Unassign"
                            variant="destructive"
                            onClick={async () => {
                              await api(
                                `/projects/${id}/assignments/core-members/${assignment.coreMemberId}`,
                                { method: "DELETE" },
                              )
                              await load()
                            }}
                          >
                            <IconUserMinus className="size-3.5" />
                          </TableActionButton>
                        ) : null}
                      </TableActionsCell>
                    </TableRow>
                  ))}
                  {assignments.coreMembers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-muted-foreground">
                        No core members assigned yet.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
            </TabsContent>

            <TabsContent value="extensions" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Add extension</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                className="grid max-w-xl gap-3"
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
                  <Input value={extAmount} onChange={(e) => setExtAmount(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>New end date</Label>
                  <Input
                    type="date"
                    required
                    min={(() => {
                      const current = new Date(String(project.endDate).slice(0, 10))
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
                <Button type="submit" className="w-fit" disabled={!extEndDate}>
                  Add extension
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Extension history</CardTitle>
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
                      <TableCell>{formatNpr(extension.amountPaisa)}</TableCell>
                      <TableCell>
                        {extension.endDate ? String(extension.endDate).slice(0, 10) : "—"}
                      </TableCell>
                      <TableCell>{String(extension.createdAt).slice(0, 10)}</TableCell>
                    </TableRow>
                  ))}
                  {(project.extensions ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-muted-foreground">
                        No extensions recorded yet.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
            </TabsContent>

            <TabsContent value="amc" className="mt-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-muted-foreground">Maintenance contracts</h2>
            {project.status === "closed" || project.status === "under_amc" ? (
              <Button size="sm" variant="outline" onClick={() => setAmcCreateOpen(true)}>
                New AMC
              </Button>
            ) : null}
          </div>
          {project.status !== "closed" && project.status !== "under_amc" ? (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">
                Close the project before setting AMC.
              </CardContent>
            </Card>
          ) : amcs.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">
                No AMC records yet.
              </CardContent>
            </Card>
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
                      alert(e instanceof ApiError ? e.message : "Failed to delete AMC")
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
          </Tabs>
        </div>

        <aside className="xl:sticky xl:top-4 xl:self-start">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Project details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <DetailRow label="Client" value={project.client?.name ?? "—"} />
              <DetailRow
                label="Categories"
                value={(project.categories ?? []).map((category) => category.name).join(", ") || "—"}
              />
              <DetailRow label="Base budget" value={formatNpr(project.budgetPaisa)} />
              <DetailRow
                label="VAT"
                value={project.isVatApplicable ? `Yes (${project.vatRateApplied}%)` : "No"}
              />
              <DetailRow
                label="Total incl. VAT"
                value={
                  profit
                    ? formatNpr(String(Number(profit.revenuePaisa) + vatAmountPaisa))
                    : formatNpr(project.budgetPaisa)
                }
              />
              <DetailRow label="Start date" value={String(project.startDate).slice(0, 10)} />
              <DetailRow label="End date" value={String(project.endDate).slice(0, 10)} />
              <DetailRow label="Status" value={project.status.replaceAll("_", " ")} capitalize />
              <DetailRow
                label="Core members"
                value={String(summary?.activeCoreMemberCount ?? assignedCoreMemberIds.size)}
              />
              <DetailRow
                label="Extensions"
                value={`${summary?.extensionCount ?? project.extensions?.length ?? 0} total`}
              />
            </CardContent>
          </Card>
        </aside>
      </div>
      {dialog}
    </div>
  )
}

function ProjectMetricCard({
  icon: Icon,
  label,
  value,
  hint,
  valueClassName,
}: {
  icon: typeof IconWallet
  label: string
  value: string
  hint: string
  valueClassName?: string
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <span className="rounded-lg bg-secondary p-2 text-secondary-foreground">
            <Icon className="size-4" />
          </span>
        </div>
        <p className={`mt-3 text-2xl font-semibold tabular-nums ${valueClassName ?? ""}`}>
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
    grain,
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
    [series, startDate, endDate, grain, periodBudgetPaisa],
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
        {grainLabel(grain)} budget {formatNpr(String(Math.round(periodBudgetPaisa)))}{" "}
        · {durationMonths} month{durationMonths === 1 ? "" : "s"} duration
      </p>
      {data.length === 0 ? (
        <div className="mt-4 flex h-70 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
          No completed stand-up allocations yet.
        </div>
      ) : (
        <ChartContainer config={chartConfig} className="mt-4 aspect-auto h-70 w-full">
          <AreaChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 8 }}>
            <defs>
              <linearGradient id="project-labor-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-laborCost)" stopOpacity={0.35} />
                <stop offset="95%" stopColor="var(--color-laborCost)" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="project-budget-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-budget)" stopOpacity={0.2} />
                <stop offset="95%" stopColor="var(--color-budget)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
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
                          <span className="text-muted-foreground">Labor cost</span>
                          <span className="font-medium">
                            {formatNpr(String(Math.round(payload.laborCost * 100)))}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-muted-foreground">Period budget</span>
                          <span className="font-medium">
                            {formatNpr(String(Math.round(payload.budget * 100)))}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-muted-foreground">Allocations</span>
                          <span className="font-medium">{payload.allocationPercentTotal}%</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-muted-foreground">Stand-ups</span>
                          <span className="font-medium">{payload.standupCount}</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-muted-foreground">Employees</span>
                          <span className="font-medium">{payload.employeeCount}</span>
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

function DetailRow({
  label,
  value,
  capitalize,
}: {
  label: string
  value: string
  capitalize?: boolean
}) {
  return (
    <div className="flex justify-between gap-4 border-b py-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-right font-medium${capitalize ? " capitalize" : ""}`}>{value}</span>
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
  grain: LaborGrain,
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
  const week = Math.floor((monday.getTime() - week1Monday.getTime()) / (7 * 86_400_000)) + 1
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
  return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(date)
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

  const today = parseUtcDate(new Date().toISOString().slice(0, 10)) ?? projectEnd
  const lastSeriesDate = series.reduce((latest, item) => {
    return item.date > latest ? item.date : latest
  }, startDate)
  const lastDate = parseUtcDate(lastSeriesDate) ?? start
  const rangeEndMs = Math.max(
    Math.min(today.getTime(), projectEnd.getTime()),
    lastDate.getTime(),
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

  for (let cursor = start; cursor.getTime() <= rangeEndMs; cursor = addUtcDays(cursor, 1)) {
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
