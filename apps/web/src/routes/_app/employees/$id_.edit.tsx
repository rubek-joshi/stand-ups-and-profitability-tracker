import * as React from "react"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { IconPencil, IconTrash } from "@tabler/icons-react"
import { Button, buttonVariants } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { PageHeader } from "@/components/page-header"
import { useConfirmDialog } from "@/components/confirm-dialog"
import { ErrorState, LoadingState } from "@/components/ui-states"
import {
  TableActionButton,
  TableActionsCell,
  TableActionsHead,
} from "@/components/table-row-actions"
import { api, ApiError, type Envelope } from "@/lib/api"
import { DEFAULT_LIST_SEARCH } from "@/lib/list-query"
import { formatNpr, parseNprInput, paisaToNpr } from "@/lib/money"
import type { Employee, SalaryEntry } from "@/lib/types"

export const Route = createFileRoute("/_app/employees/$id_/edit")({
  component: EmployeeEditPage,
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

function EmployeeEditPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const { confirm, dialog } = useConfirmDialog()
  const [employee, setEmployee] = React.useState<Employee | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [dateJoined, setDateJoined] = React.useState("")
  const [dateOfBirth, setDateOfBirth] = React.useState("")
  const [salaryOpen, setSalaryOpen] = React.useState(false)
  const [editingEntry, setEditingEntry] = React.useState<SalaryEntry | null>(null)
  const [salaryForm, setSalaryForm] = React.useState<SalaryForm>(emptySalaryForm)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api<Envelope<Employee>>(`/employees/${id}`)
      setEmployee(res.data)
      setName(res.data.name)
      setEmail(res.data.email)
      setDateJoined(String(res.data.dateJoined).slice(0, 10))
      setDateOfBirth(
        res.data.dateOfBirth ? String(res.data.dateOfBirth).slice(0, 10) : "",
      )
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
  if (!employee) return null

  const entries = employee.salaryEntries ?? []

  return (
    <div>
      <PageHeader
        title={`Edit ${employee.name}`}
        description="Update profile and salary entries"
        breadcrumbs={[
          { label: "Employees", to: "/employees", search: DEFAULT_LIST_SEARCH },
          { label: employee.name, to: "/employees/$id", params: { id } },
          { label: "Edit" },
        ]}
        actions={
          <Link
            to="/employees/$id"
            params={{ id }}
            className={buttonVariants({ variant: "secondary" })}
          >
            Cancel
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault()
                const today = new Date().toISOString().slice(0, 10)
                if (dateOfBirth && dateOfBirth > today) {
                  alert("Date of birth cannot be in the future")
                  return
                }
                setSaving(true)
                try {
                  await api(`/employees/${id}`, {
                    method: "PATCH",
                    body: {
                      name: name.trim(),
                      email: email.trim(),
                      dateJoined,
                      dateOfBirth: dateOfBirth || null,
                    },
                  })
                  void navigate({ to: "/employees/$id", params: { id } })
                } catch (err) {
                  alert(err instanceof ApiError ? err.message : "Save failed")
                } finally {
                  setSaving(false)
                }
              }}
            >
              <div className="space-y-2">
                <Label>Name</Label>
                <Input required value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Date joined</Label>
                <Input
                  type="date"
                  required
                  value={dateJoined}
                  onChange={(e) => setDateJoined(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Date of birth (optional)</Label>
                <Input
                  type="date"
                  max={new Date().toISOString().slice(0, 10)}
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save profile"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Salary entries</CardTitle>
            <Button size="sm" onClick={openCreateSalary}>
              Add
            </Button>
          </CardHeader>
          <CardContent>
            {entries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No salary entries</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Effective</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableActionsHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>{String(entry.effectiveDate).slice(0, 10)}</TableCell>
                      <TableCell>{formatNpr(entry.salaryPaisa)}</TableCell>
                      <TableCell className="max-w-40 truncate">
                        {entry.reason?.trim() || "—"}
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
                            await api(`/employees/${id}/salary-entries/${entry.id}`, {
                              method: "DELETE",
                            })
                            await load()
                          }}
                        >
                          <IconTrash className="size-3.5" />
                        </TableActionButton>
                      </TableActionsCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={salaryOpen}
        onOpenChange={(open) => {
          setSalaryOpen(open)
          if (!open) setEditingEntry(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingEntry ? "Edit salary entry" : "Add salary entry"}</DialogTitle>
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
                await api(`/employees/${id}/salary-entries/${editingEntry.id}`, {
                  method: "PATCH",
                  body,
                })
              } else {
                await api(`/employees/${id}/salary-entries`, {
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
                onChange={(e) => setSalaryForm((f) => ({ ...f, salaryNpr: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Effective date</Label>
              <Input
                type="date"
                required
                value={salaryForm.effectiveDate}
                onChange={(e) => setSalaryForm((f) => ({ ...f, effectiveDate: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Input
                value={salaryForm.reason}
                onChange={(e) => setSalaryForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="Optional"
              />
            </div>
            <DialogFooter>
              <Button type="submit">{editingEntry ? "Save entry" : "Add entry"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {dialog}
    </div>
  )
}
