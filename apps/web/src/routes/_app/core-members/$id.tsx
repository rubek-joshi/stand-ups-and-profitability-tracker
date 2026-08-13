import * as React from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Button } from "@workspace/ui/components/button"
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
import { StatusBadge } from "@/components/health-badge"
import { useConfirmDialog } from "@/components/confirm-dialog"
import { ErrorState, LoadingState } from "@/components/ui-states"
import { api, ApiError, type Envelope } from "@/lib/api"
import { formatNpr, parseNprInput, paisaToNpr } from "@/lib/money"
import type { CoreMember } from "@/lib/types"

export const Route = createFileRoute("/_app/core-members/$id")({
  component: CoreMemberDetailPage,
})

function CoreMemberDetailPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const { confirm, dialog } = useConfirmDialog()
  const [member, setMember] = React.useState<CoreMember | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [salaryOpen, setSalaryOpen] = React.useState(false)
  const [salaryForm, setSalaryForm] = React.useState({
    salaryNpr: "",
    effectiveDate: new Date().toISOString().slice(0, 10),
    reason: "",
  })

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api<Envelope<CoreMember>>(`/core-members/${id}`)
      setMember(res.data)
      setName(res.data.name)
      setEmail(res.data.email)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load")
    } finally {
      setLoading(false)
    }
  }, [id])

  React.useEffect(() => {
    void load()
  }, [load])

  if (loading) return <LoadingState />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (!member) return null

  const entries = member.salaryEntries ?? []

  return (
    <div>
      <PageHeader
        title={member.name}
        description={member.email}
        actions={
          <>
            <StatusBadge status={member.status} />
            {member.status === "active" ? (
              <Button
                variant="outline"
                onClick={async () => {
                  const dateLeft = window.prompt(
                    "Date left (YYYY-MM-DD)",
                    new Date().toISOString().slice(0, 10),
                  )
                  if (!dateLeft) return
                  await api(`/core-members/${id}/mark-left`, {
                    method: "POST",
                    body: { dateLeft },
                  })
                  await load()
                }}
              >
                Mark left
              </Button>
            ) : null}
            <Button
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
              Delete
            </Button>
          </>
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
                await api(`/core-members/${id}`, {
                  method: "PATCH",
                  body: { name: name.trim(), email: email.trim() },
                })
                await load()
              }}
            >
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <Button type="submit">Save</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Salary entries</CardTitle>
            <Button size="sm" onClick={() => setSalaryOpen(true)}>
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
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>{String(entry.effectiveDate).slice(0, 10)}</TableCell>
                      <TableCell>{formatNpr(entry.salaryPaisa)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            const next = window.prompt(
                              "New salary NPR",
                              String(paisaToNpr(entry.salaryPaisa)),
                            )
                            if (next == null) return
                            const ok = await confirm({
                              title: "Update salary entry?",
                              description:
                                "This may recalculate cost and profit/loss for affected projects.",
                              confirmLabel: "Update",
                              destructive: true,
                            })
                            if (!ok) return
                            await api(`/core-members/${id}/salary-entries/${entry.id}`, {
                              method: "PATCH",
                              body: { salaryNpr: parseNprInput(next) },
                            })
                            await load()
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="ml-2"
                          onClick={async () => {
                            const ok = await confirm({
                              title: "Delete salary entry?",
                              description:
                                "This will recalculate cost and profit/loss for affected periods.",
                              confirmLabel: "Delete",
                              destructive: true,
                            })
                            if (!ok) return
                            await api(`/core-members/${id}/salary-entries/${entry.id}`, {
                              method: "DELETE",
                            })
                            await load()
                          }}
                        >
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={salaryOpen} onOpenChange={setSalaryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add salary entry</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault()
              await api(`/core-members/${id}/salary-entries`, {
                method: "POST",
                body: {
                  salaryNpr: parseNprInput(salaryForm.salaryNpr),
                  effectiveDate: salaryForm.effectiveDate,
                  reason: salaryForm.reason || undefined,
                },
              })
              setSalaryOpen(false)
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
              />
            </div>
            <DialogFooter>
              <Button type="submit">Add</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {dialog}
    </div>
  )
}
