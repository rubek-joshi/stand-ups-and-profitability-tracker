import * as React from "react"
import { Link, createFileRoute } from "@tanstack/react-router"
import { IconUserMinus } from "@tabler/icons-react"
import { Button, buttonVariants } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"
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
import { AmcCard } from "@/components/amc/amc-card"
import { CreateAmcDialog } from "@/components/amc/create-amc-dialog"
import { DeclineAmcDialog } from "@/components/amc/decline-amc-dialog"
import { EditAmcDialog } from "@/components/amc/edit-amc-dialog"
import { useConfirmDialog } from "@/components/confirm-dialog"
import { ErrorState, LoadingState } from "@/components/ui-states"
import { CoreMemberLink, EmployeeLink } from "@/components/resource-link"
import {
  TableActionButton,
  TableActionsCell,
  TableActionsHead,
} from "@/components/table-row-actions"
import { api, ApiError, type Envelope } from "@/lib/api"
import { useAuth } from "@/lib/auth"
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
  const [tab, setTab] = React.useState("overview")
  const [extReason, setExtReason] = React.useState("")
  const [extAmount, setExtAmount] = React.useState("0")
  const [extEndDate, setExtEndDate] = React.useState("")
  const [employeeId, setEmployeeId] = React.useState("")
  const [coreMemberId, setCoreMemberId] = React.useState("")
  const [amcCreateOpen, setAmcCreateOpen] = React.useState(false)
  const [declineAmc, setDeclineAmc] = React.useState<AmcRecord | null>(null)
  const [editAmc, setEditAmc] = React.useState<AmcRecord | null>(null)
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
      setEmployees(emps.data.filter((e) => e.status === "active"))
      setCoreMembers(cores.data.filter((m) => m.status === "active"))
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

      <Tabs value={tab} onValueChange={(value) => setTab(String(value))}>
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
              <DetailRow label="Status" value={project.status} capitalize />
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
                    <TableActionsHead />
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
                      <TableActionsCell>
                        {!a.unassignedAt ? (
                          <TableActionButton
                            label="Unassign"
                            variant="destructive"
                            onClick={async () => {
                              await api(
                                `/projects/${id}/assignments/employees/${a.employeeId}`,
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
                    <TableActionsHead />
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
                      <TableActionsCell>
                        {!a.unassignedAt ? (
                          <TableActionButton
                            label="Unassign"
                            variant="destructive"
                            onClick={async () => {
                              await api(
                                `/projects/${id}/assignments/core-members/${a.coreMemberId}`,
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
              <CardTitle className="text-base">History</CardTitle>
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
                  {(project.extensions ?? []).map((x) => (
                    <TableRow key={x.id}>
                      <TableCell>
                        {x.reason}
                        {x.isAuto ? " (auto)" : ""}
                      </TableCell>
                      <TableCell>{formatNpr(x.amountPaisa)}</TableCell>
                      <TableCell>
                        {x.endDate ? String(x.endDate).slice(0, 10) : "—"}
                      </TableCell>
                      <TableCell>{String(x.createdAt).slice(0, 10)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="amc" className="mt-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-muted-foreground">
              Maintenance contracts
            </h2>
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
      {dialog}
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
