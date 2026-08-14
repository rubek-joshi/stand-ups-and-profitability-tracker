import * as React from "react"
import { Link, createFileRoute } from "@tanstack/react-router"
import { IconEye, IconPencil } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
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
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/health-badge"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui-states"
import {
  TableActionLink,
  TableActionsCell,
  TableActionsHead,
} from "@/components/table-row-actions"
import { api, ApiError, type Envelope } from "@/lib/api"
import { formatNpr, parseNprInput } from "@/lib/money"
import type { Employee } from "@/lib/types"

export const Route = createFileRoute("/_app/employees/")({
  component: EmployeesPage,
})

function EmployeesPage() {
  const [items, setItems] = React.useState<Employee[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState(false)
  const [form, setForm] = React.useState({
    name: "",
    email: "",
    dateJoined: new Date().toISOString().slice(0, 10),
    initialSalaryNpr: "",
  })

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api<Envelope<Employee[]>>("/employees")
      setItems(res.data)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load employees")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  return (
    <div>
      <PageHeader
        title="Employees"
        description="Team members who participate in stand-ups"
        actions={<Button onClick={() => setOpen(true)}>New employee</Button>}
      />
      {loading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!loading && items.length === 0 ? <EmptyState message="No employees" /> : null}
      {items.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
                <TableActionsHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>
                    <Link
                      to="/employees/$id"
                      params={{ id: e.id }}
                      className="font-medium hover:underline"
                    >
                      {e.name}
                    </Link>
                  </TableCell>
                  <TableCell>{e.email}</TableCell>
                  <TableCell>
                    <StatusBadge status={e.status} />
                  </TableCell>
                  <TableCell>{e.dateJoined?.slice?.(0, 10) ?? String(e.dateJoined).slice(0, 10)}</TableCell>
                  <TableActionsCell>
                    <TableActionLink
                      label="View"
                      to="/employees/$id"
                      params={{ id: e.id }}
                    >
                      <IconEye className="size-3.5" />
                    </TableActionLink>
                    <TableActionLink
                      label="Edit"
                      to="/employees/$id/edit"
                      params={{ id: e.id }}
                    >
                      <IconPencil className="size-3.5" />
                    </TableActionLink>
                  </TableActionsCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create employee</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={async (ev) => {
              ev.preventDefault()
              try {
                await api("/employees", {
                  method: "POST",
                  body: {
                    name: form.name.trim(),
                    email: form.email.trim(),
                    dateJoined: form.dateJoined,
                    initialSalaryNpr: form.initialSalaryNpr
                      ? parseNprInput(form.initialSalaryNpr)
                      : undefined,
                  },
                })
                setOpen(false)
                await load()
              } catch (err) {
                alert(err instanceof ApiError ? err.message : "Failed")
              }
            }}
          >
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Date joined</Label>
              <Input
                type="date"
                required
                value={form.dateJoined}
                onChange={(e) => setForm((f) => ({ ...f, dateJoined: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Initial salary (NPR)</Label>
              <Input
                value={form.initialSalaryNpr}
                onChange={(e) => setForm((f) => ({ ...f, initialSalaryNpr: e.target.value }))}
                placeholder="Optional"
              />
              {form.initialSalaryNpr ? (
                <p className="text-xs text-muted-foreground">
                  Preview: {formatNpr(String(Math.round(Number(form.initialSalaryNpr || 0) * 100)))}
                </p>
              ) : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Create</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
