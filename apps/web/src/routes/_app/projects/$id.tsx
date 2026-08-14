import * as React from "react"
import { Link, createFileRoute } from "@tanstack/react-router"
import { Button, buttonVariants } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"
import { Switch } from "@workspace/ui/components/switch"
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { PageHeader } from "@/components/page-header"
import { HealthBadge, StatusBadge } from "@/components/health-badge"
import { useConfirmDialog } from "@/components/confirm-dialog"
import { ErrorState, LoadingState } from "@/components/ui-states"
import { CoreMemberLink, EmployeeLink } from "@/components/resource-link"
import { api, ApiError, type Envelope } from "@/lib/api"
import { formatNpr, parseNprInput } from "@/lib/money"
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
  const { confirm, dialog } = useConfirmDialog()
  const [project, setProject] = React.useState<Project | null>(null)
  const [assignments, setAssignments] = React.useState<{
    employees: ProjectAssignment[]
    coreMembers: CoreMemberAssignment[]
  }>({ employees: [], coreMembers: [] })
  const [employees, setEmployees] = React.useState<Employee[]>([])
  const [coreMembers, setCoreMembers] = React.useState<CoreMember[]>([])
  const [amc, setAmc] = React.useState<AmcRecord | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [extReason, setExtReason] = React.useState("")
  const [extAmount, setExtAmount] = React.useState("0")
  const [employeeId, setEmployeeId] = React.useState("")
  const [coreMemberId, setCoreMemberId] = React.useState("")
  const [amcForm, setAmcForm] = React.useState({
    setDate: new Date().toISOString().slice(0, 10),
    freeUntilDate: "",
    amcAmountNpr: "",
    isVatApplicable: true,
  })

  const load = React.useCallback(async () => {
    setLoading(true)
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
      setEmployees(emps.data.filter((e) => e.status === "active"))
      setCoreMembers(cores.data.filter((m) => m.status === "active"))
      try {
        const amcRes = await api<Envelope<AmcRecord>>(`/amc/projects/${id}`)
        setAmc(amcRes.data)
      } catch {
        setAmc(null)
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load project")
    } finally {
      setLoading(false)
    }
  }, [id])

  React.useEffect(() => {
    void load()
  }, [load])

  if (loading) return <LoadingState />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (!project) return null

  const profit = project.profitability
  const assignedEmployeeIds = new Set(
    assignments.employees.filter((a) => !a.unassignedAt).map((a) => a.employeeId),
  )
  const assignedCoreMemberIds = new Set(
    assignments.coreMembers.filter((a) => !a.unassignedAt).map((a) => a.coreMemberId),
  )
  const availableEmployees = employees.filter((e) => !assignedEmployeeIds.has(e.id))
  const availableCoreMembers = coreMembers.filter((m) => !assignedCoreMemberIds.has(m.id))

  return (
    <div>
      <PageHeader
        title={project.name}
        description={`${project.client?.name ?? "Client"} · ${(project.categories ?? []).map((c) => c.name).join(", ") || "No categories"}`}
        actions={
          <>
            <StatusBadge status={project.status} />
            {profit ? <HealthBadge marginPercent={profit.marginPercent} /> : null}
            <Link to="/projects/$id/edit" params={{ id }} className={buttonVariants()}>
              Edit
            </Link>
            {project.status !== "closed" && project.status !== "under_amc" ? (
              <Button
                variant="outline"
                onClick={async () => {
                  const ok = await confirm({
                    title: "Close project?",
                    description: "Closing freezes the project. You can set AMC afterward.",
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

      {profit ? (
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Budget" value={formatNpr(profit.budgetPaisa)} />
          <Metric label="Revenue" value={formatNpr(profit.revenuePaisa)} />
          <Metric label="Total cost" value={formatNpr(profit.totalCostPaisa)} />
          <Metric
            label="P/L"
            value={`${formatNpr(profit.profitLossPaisa, { signed: true })} (${profit.marginPercent.toFixed(1)}%)`}
          />
        </div>
      ) : null}

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="assignments">Assignments</TabsTrigger>
          <TabsTrigger value="extensions">Extensions</TabsTrigger>
          <TabsTrigger value="amc">AMC</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <DetailRow label="Name" value={project.name} />
              <DetailRow label="Client" value={project.client?.name ?? "—"} />
              <DetailRow
                label="Categories"
                value={(project.categories ?? []).map((c) => c.name).join(", ") || "—"}
              />
              <DetailRow label="Budget" value={formatNpr(project.budgetPaisa)} />
              <DetailRow label="Start" value={String(project.startDate).slice(0, 10)} />
              <DetailRow label="End" value={String(project.endDate).slice(0, 10)} />
              <DetailRow label="Status" value={project.status} />
              <DetailRow
                label="VAT"
                value={project.isVatApplicable ? `Yes (${project.vatRateApplied}%)` : "No"}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assignments" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Employees</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Select
                  value={employeeId || null}
                  onValueChange={(v) => setEmployeeId(v ?? "")}
                  items={Object.fromEntries(availableEmployees.map((e) => [e.id, e.name]))}
                  disabled={availableEmployees.length === 0}
                >
                  <SelectTrigger className="w-64">
                    <SelectValue
                      placeholder={
                        availableEmployees.length === 0
                          ? "All employees assigned"
                          : "Assign employee"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {availableEmployees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  disabled={!employeeId}
                  onClick={async () => {
                    await api(`/projects/${id}/assignments/employees`, {
                      method: "POST",
                      body: { employeeId },
                    })
                    setEmployeeId("")
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
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignments.employees.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        <EmployeeLink id={a.employeeId}>
                          {a.employee?.name ?? a.employeeId}
                        </EmployeeLink>
                      </TableCell>
                      <TableCell>{String(a.assignedAt).slice(0, 10)}</TableCell>
                      <TableCell>
                        {a.unassignedAt ? String(a.unassignedAt).slice(0, 10) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {!a.unassignedAt ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              await api(
                                `/projects/${id}/assignments/employees/${a.employeeId}`,
                                { method: "DELETE" },
                              )
                              await load()
                            }}
                          >
                            Unassign
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
                  onValueChange={(v) => setCoreMemberId(v ?? "")}
                  items={Object.fromEntries(availableCoreMembers.map((m) => [m.id, m.name]))}
                  disabled={availableCoreMembers.length === 0}
                >
                  <SelectTrigger className="w-64">
                    <SelectValue
                      placeholder={
                        availableCoreMembers.length === 0
                          ? "All core members assigned"
                          : "Assign core member"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {availableCoreMembers.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  disabled={!coreMemberId}
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
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignments.coreMembers.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        <CoreMemberLink id={a.coreMemberId}>
                          {a.coreMember?.name ?? a.coreMemberId}
                        </CoreMemberLink>
                      </TableCell>
                      <TableCell>{String(a.assignedAt).slice(0, 10)}</TableCell>
                      <TableCell>
                        {a.unassignedAt ? String(a.unassignedAt).slice(0, 10) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {!a.unassignedAt ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              await api(
                                `/projects/${id}/assignments/core-members/${a.coreMemberId}`,
                                { method: "DELETE" },
                              )
                              await load()
                            }}
                          >
                            Unassign
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
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
                    },
                  })
                  setExtReason("")
                  setExtAmount("0")
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
                <Button type="submit" className="w-fit">
                  Add extension
                </Button>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">History</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reason</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(project.extensions ?? []).map((x) => (
                    <TableRow key={x.id}>
                      <TableCell>
                        {x.reason}
                        {x.isAuto ? " (auto)" : ""}
                      </TableCell>
                      <TableCell>{formatNpr(x.amountPaisa)}</TableCell>
                      <TableCell>{String(x.createdAt).slice(0, 10)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="amc" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">AMC</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {project.status !== "closed" && project.status !== "under_amc" ? (
                <p className="text-sm text-muted-foreground">
                  Close the project before setting AMC.
                </p>
              ) : null}
              {amc ? (
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    Status: <StatusBadge status={amc.status} />
                  </div>
                  <p>Free until: {String(amc.freeUntilDate).slice(0, 10)}</p>
                  <p>Amount: {amc.amcAmountPaisa ? formatNpr(amc.amcAmountPaisa) : "—"}</p>
                  {amc.status !== "cancelled" ? (
                    <Button
                      variant="destructive"
                      onClick={async () => {
                        const ok = await confirm({
                          title: "Cancel AMC?",
                          description: "Reminders will stop for this project.",
                          confirmLabel: "Cancel AMC",
                          destructive: true,
                        })
                        if (!ok) return
                        const remark = window.prompt("Optional remark") ?? undefined
                        await api(`/amc/projects/${id}/cancel`, {
                          method: "POST",
                          body: { remark },
                        })
                        await load()
                      }}
                    >
                      Cancel AMC
                    </Button>
                  ) : null}
                </div>
              ) : project.status === "closed" ? (
                <form
                  className="grid max-w-md gap-3"
                  onSubmit={async (e) => {
                    e.preventDefault()
                    await api(`/amc/projects/${id}`, {
                      method: "POST",
                      body: {
                        setDate: amcForm.setDate,
                        freeUntilDate: amcForm.freeUntilDate,
                        isVatApplicable: amcForm.isVatApplicable,
                        amcAmountNpr: amcForm.amcAmountNpr
                          ? parseNprInput(amcForm.amcAmountNpr)
                          : undefined,
                      },
                    })
                    await load()
                  }}
                >
                  <div className="space-y-2">
                    <Label>Set date</Label>
                    <Input
                      type="date"
                      required
                      value={amcForm.setDate}
                      onChange={(e) => setAmcForm((f) => ({ ...f, setDate: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Free until</Label>
                    <Input
                      type="date"
                      required
                      value={amcForm.freeUntilDate}
                      onChange={(e) =>
                        setAmcForm((f) => ({ ...f, freeUntilDate: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>AMC amount (NPR)</Label>
                    <Input
                      value={amcForm.amcAmountNpr}
                      onChange={(e) => setAmcForm((f) => ({ ...f, amcAmountNpr: e.target.value }))}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-md border px-3 py-2">
                    <Label>VAT applicable</Label>
                    <Switch
                      checked={amcForm.isVatApplicable}
                      onCheckedChange={(c) =>
                        setAmcForm((f) => ({ ...f, isVatApplicable: Boolean(c) }))
                      }
                    />
                  </div>
                  <Button type="submit" className="w-fit">
                    Set AMC
                  </Button>
                </form>
              ) : (
                <p className="text-sm text-muted-foreground">No AMC record.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      {dialog}
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b py-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium capitalize">{value}</span>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-lg font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  )
}
