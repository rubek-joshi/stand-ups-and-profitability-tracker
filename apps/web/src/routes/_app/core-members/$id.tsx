import * as React from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import {
  IconDotsVertical,
  IconPencil,
  IconTrash,
  IconTrendingUp,
  IconUserOff,
} from "@tabler/icons-react"
import { format, parseISO } from "date-fns"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import {
  Dialog,
  DialogContent,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/health-badge"
import { MailLink, TelLink } from "@/components/contact-link"
import { JoinedDate } from "@/components/joined-date"
import { useConfirmDialog } from "@/components/confirm-dialog"
import { DateInput } from "@/components/datetime-picker"
import { MarkLeftDialog } from "@/components/mark-left-dialog"
import { ErrorState, LoadingState } from "@/components/ui-states"
import {
  TableActionButton,
  TableActionLink,
  TableActionsCell,
  TableActionsHead,
} from "@/components/table-row-actions"
import { api, ApiError, type Envelope } from "@/lib/api"
import { formatJoinedDate } from "@/lib/dates"
import { formatNpr, paisaToNpr, parseNprInput } from "@/lib/money"
import type { CoreMember, SalaryEntry } from "@/lib/types"

export const Route = createFileRoute("/_app/core-members/$id")({
  component: CoreMemberDetailPage,
})

type SalaryForm = {
  salaryNpr: string
  effectiveDate: string
  reason: string
}

const emptySalaryForm = (): SalaryForm => ({
  salaryNpr: "",
  effectiveDate: new Date().toISOString().slice(0, 10),
  reason: "",
})

function toDateKey(value: string | Date) {
  if (typeof value === "string") return value.slice(0, 10)
  return value.toISOString().slice(0, 10)
}

function CoreMemberDetailPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const { confirm, dialog } = useConfirmDialog()
  const [markLeftOpen, setMarkLeftOpen] = React.useState(false)
  const [member, setMember] = React.useState<CoreMember | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [salaryOpen, setSalaryOpen] = React.useState(false)
  const [editingEntry, setEditingEntry] = React.useState<SalaryEntry | null>(null)
  const [salaryForm, setSalaryForm] = React.useState<SalaryForm>(emptySalaryForm)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api<Envelope<CoreMember>>(`/core-members/${id}`)
      setMember(res.data)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load")
    } finally {
      setLoading(false)
    }
  }, [id])

  React.useEffect(() => {
    void load()
  }, [load])

  const openCreateSalary = () => {
    setEditingEntry(null)
    setSalaryForm(emptySalaryForm())
    setSalaryOpen(true)
  }

  const openEditSalary = (entry: SalaryEntry) => {
    setEditingEntry(entry)
    setSalaryForm({
      salaryNpr: String(paisaToNpr(entry.salaryPaisa)),
      effectiveDate: String(entry.effectiveDate).slice(0, 10),
      reason: entry.reason ?? "",
    })
    setSalaryOpen(true)
  }

  if (loading) return <LoadingState />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (!member) return null

  const salaryEntries = member.salaryEntries ?? []
  const currentSalary = salaryEntries[0]
  const canDelete = salaryEntries.length === 0

  return (
    <div>
      <PageHeader
        title={member.name}
        description={member.email}
        breadcrumbs={[
          { label: "Core Members", to: "/core-members" },
          { label: member.name },
        ]}
        status={<StatusBadge status={member.status} />}
        actions={
          <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Core member actions"
                  />
                }
              >
                <IconDotsVertical />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-40">
                <DropdownMenuGroup>
                  {member.status === "active" ? (
                    <DropdownMenuItem onClick={() => setMarkLeftOpen(true)}>
                      <IconUserOff />
                      Mark left
                    </DropdownMenuItem>
                  ) : null}
                  {canDelete ? (
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={async () => {
                        const ok = await confirm({
                          title: "Delete core member?",
                          description: "Only allowed if there is no history.",
                          confirmLabel: "Delete",
                          destructive: true,
                        })
                        if (!ok) return
                        try {
                          await api(`/core-members/${id}`, { method: "DELETE" })
                          void navigate({ to: "/core-members" })
                        } catch (e) {
                          alert(e instanceof ApiError ? e.message : "Delete failed")
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
                        Cannot delete: core member has salary history
                      </TooltipContent>
                    </Tooltip>
                  )}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <section className="min-w-0">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base">Salary history</CardTitle>
                {currentSalary ? (
                  <Badge variant="secondary" className="gap-1">
                    <IconTrendingUp className="size-3" />
                    {formatNpr(currentSalary.salaryPaisa)}
                  </Badge>
                ) : null}
              </div>
              <Button size="sm" onClick={openCreateSalary}>
                Add
              </Button>
            </CardHeader>
            <CardContent>
              {salaryEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground">No salary entries</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Effective</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead className="text-right">Change</TableHead>
                      <TableActionsHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salaryEntries.map((entry, i) => {
                      const prev = salaryEntries[i + 1]
                      const current = paisaToNpr(entry.salaryPaisa)
                      const previous = prev ? paisaToNpr(prev.salaryPaisa) : null
                      const delta =
                        previous && previous !== 0
                          ? ((current - previous) / previous) * 100
                          : null
                      return (
                        <TableRow key={entry.id}>
                          <TableCell>
                            <div className="font-medium whitespace-nowrap">
                              {format(parseISO(toDateKey(entry.effectiveDate)), "d MMM yyyy")}
                            </div>
                            {entry.reason?.trim() ? (
                              <div className="text-xs text-muted-foreground">{entry.reason}</div>
                            ) : null}
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {formatNpr(entry.salaryPaisa)}
                          </TableCell>
                          <TableCell className="text-right">
                            {delta === null ? (
                              <span className="text-xs text-muted-foreground">Starting</span>
                            ) : (
                              <Badge variant={delta >= 0 ? "default" : "destructive"}>
                                {delta >= 0 ? "+" : ""}
                                {delta.toFixed(1)}%
                              </Badge>
                            )}
                          </TableCell>
                          <TableActionsCell>
                            <TableActionButton
                              label="Edit"
                              onClick={() => openEditSalary(entry)}
                            >
                              <IconPencil className="size-3.5" />
                            </TableActionButton>
                            <TableActionButton
                              label="Delete"
                              variant="destructive"
                              onClick={async () => {
                                const ok = await confirm({
                                  title: "Delete salary entry?",
                                  description:
                                    "This will recalculate cost and profit/loss for affected periods.",
                                  confirmLabel: "Delete",
                                  destructive: true,
                                })
                                if (!ok) return
                                await api(
                                  `/core-members/${id}/salary-entries/${entry.id}`,
                                  { method: "DELETE" },
                                )
                                await load()
                              }}
                            >
                              <IconTrash className="size-3.5" />
                            </TableActionButton>
                          </TableActionsCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </section>

        <aside className="lg:sticky lg:top-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">Profile</CardTitle>
              <TableActionLink
                label="Edit details"
                to="/core-members/$id/edit"
                params={{ id }}
              >
                <IconPencil className="size-3.5" />
              </TableActionLink>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <Detail label="Name" value={member.name} />
              <Detail
                label="Email"
                value={<MailLink value={member.email} withCopy />}
              />
              <Detail
                label="Contact number"
                value={
                  member.contactNumber ? (
                    <TelLink value={member.contactNumber} withCopy />
                  ) : (
                    "—"
                  )
                }
              />
              <Detail
                label="PAN number"
                value={member.panNumber || "—"}
              />
              <Detail
                label="Joined"
                value={<JoinedDate value={member.dateJoined} />}
              />
              <Detail
                label="Left"
                value={
                  member.dateLeft ? formatJoinedDate(member.dateLeft) : "—"
                }
              />
            </CardContent>
          </Card>
        </aside>
      </div>
      {dialog}
      <Dialog
        open={salaryOpen}
        onOpenChange={(open) => {
          setSalaryOpen(open)
          if (!open) setEditingEntry(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingEntry ? "Edit salary entry" : "Add salary entry"}
            </DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault()
              const body = {
                salaryNpr: parseNprInput(salaryForm.salaryNpr),
                effectiveDate: salaryForm.effectiveDate,
                reason: salaryForm.reason.trim() || undefined,
              }
              if (editingEntry) {
                const ok = await confirm({
                  title: "Update salary entry?",
                  description:
                    "This may recalculate cost and profit/loss for affected projects.",
                  confirmLabel: "Update",
                  destructive: true,
                })
                if (!ok) return
                await api(`/core-members/${id}/salary-entries/${editingEntry.id}`, {
                  method: "PATCH",
                  body,
                })
              } else {
                await api(`/core-members/${id}/salary-entries`, {
                  method: "POST",
                  body,
                })
              }
              setSalaryOpen(false)
              setEditingEntry(null)
              await load()
            }}
          >
            <div className="space-y-2">
              <Label>Salary (NPR)</Label>
              <Input
                required
                value={salaryForm.salaryNpr}
                onChange={(e) =>
                  setSalaryForm((f) => ({ ...f, salaryNpr: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Effective date</Label>
              <DateInput
                value={salaryForm.effectiveDate}
                onChange={(next) =>
                  setSalaryForm((f) => ({
                    ...f,
                    effectiveDate: next ?? "",
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Input
                value={salaryForm.reason}
                onChange={(e) =>
                  setSalaryForm((f) => ({ ...f, reason: e.target.value }))
                }
                placeholder="Optional"
              />
            </div>
            <DialogFooter>
              <Button type="submit">
                {editingEntry ? "Save entry" : "Add entry"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <MarkLeftDialog
        open={markLeftOpen}
        onOpenChange={setMarkLeftOpen}
        personName={member.name}
        onConfirm={async (dateLeft) => {
          try {
            await api(`/core-members/${id}/mark-left`, {
              method: "POST",
              body: { dateLeft },
            })
            await load()
          } catch (e) {
            alert(e instanceof ApiError ? e.message : "Failed to mark left")
            throw e
          }
        }}
      />
    </div>
  )
}

function Detail({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{value}</dd>
    </div>
  )
}
