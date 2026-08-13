import * as React from "react"
import { Link, createFileRoute } from "@tanstack/react-router"
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
import { Switch } from "@workspace/ui/components/switch"
import { Checkbox } from "@workspace/ui/components/checkbox"
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
import { StatusBadge } from "@/components/health-badge"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui-states"
import { api, ApiError, type Envelope } from "@/lib/api"
import { formatNpr, parseNprInput } from "@/lib/money"
import type { Category, Client, Project } from "@/lib/types"

export const Route = createFileRoute("/_app/projects/")({
  component: ProjectsPage,
})

function ProjectsPage() {
  const [projects, setProjects] = React.useState<Project[]>([])
  const [clients, setClients] = React.useState<Client[]>([])
  const [categories, setCategories] = React.useState<Category[]>([])
  const [statusFilter, setStatusFilter] = React.useState<string>("")
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState(false)
  const [form, setForm] = React.useState({
    name: "",
    clientId: "",
    categoryIds: [] as string[],
    budgetNpr: "",
    startDate: new Date().toISOString().slice(0, 10),
    endDate: "",
    isVatApplicable: true,
  })

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = statusFilter ? `?status=${statusFilter}` : ""
      const [p, c, cat] = await Promise.all([
        api<Envelope<Project[]>>(`/projects${qs}`),
        api<Envelope<Client[]>>("/clients"),
        api<Envelope<Category[]>>("/categories"),
      ])
      setProjects(p.data)
      setClients(c.data)
      setCategories(cat.data.filter((x) => x.isActive))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load projects")
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  React.useEffect(() => {
    void load()
  }, [load])

  return (
    <div>
      <PageHeader
        title="Projects"
        description="Budgets, assignments, and profitability"
        actions={
          <>
            <Select
              value={statusFilter || undefined}
              onValueChange={(v) => setStatusFilter(v ?? "")}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="extended">Extended</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
                <SelectItem value="under_amc">Under AMC</SelectItem>
              </SelectContent>
            </Select>
            {statusFilter ? (
              <Button variant="outline" onClick={() => setStatusFilter("")}>
                Clear filter
              </Button>
            ) : null}
            <Button onClick={() => setOpen(true)}>New project</Button>
          </>
        }
      />
      {loading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!loading && projects.length === 0 ? <EmptyState message="No projects" /> : null}
      {projects.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Budget</TableHead>
                <TableHead>Dates</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link
                      to="/projects/$id"
                      params={{ id: p.id }}
                      className="font-medium hover:underline"
                    >
                      {p.name}
                    </Link>
                  </TableCell>
                  <TableCell>{p.client?.name ?? "—"}</TableCell>
                  <TableCell>
                    <StatusBadge status={p.status} />
                  </TableCell>
                  <TableCell className="tabular-nums">{formatNpr(p.budgetPaisa)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {String(p.startDate).slice(0, 10)} → {String(p.endDate).slice(0, 10)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create project</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault()
              try {
                await api("/projects", {
                  method: "POST",
                  body: {
                    name: form.name.trim(),
                    clientId: form.clientId,
                    categoryIds: form.categoryIds,
                    budgetNpr: parseNprInput(form.budgetNpr),
                    startDate: form.startDate,
                    endDate: form.endDate,
                    isVatApplicable: form.isVatApplicable,
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
              <Label>Client</Label>
              <Select
                value={form.clientId || undefined}
                onValueChange={(v) => setForm((f) => ({ ...f, clientId: v ?? "" }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  {clients
                    .filter((c) => c.status === "active")
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Categories</Label>
              <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-3">
                {categories.map((c) => {
                  const checked = form.categoryIds.includes(c.id)
                  return (
                    <label key={c.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) => {
                          setForm((f) => ({
                            ...f,
                            categoryIds: value
                              ? [...f.categoryIds, c.id]
                              : f.categoryIds.filter((id) => id !== c.id),
                          }))
                        }}
                      />
                      {c.name}
                    </label>
                  )
                })}
              </div>
              {form.categoryIds.length === 0 ? (
                <p className="text-xs text-destructive">Select at least one category</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label>Budget (NPR)</Label>
              <Input
                required
                value={form.budgetNpr}
                onChange={(e) => setForm((f) => ({ ...f, budgetNpr: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Start</Label>
                <Input
                  type="date"
                  required
                  value={form.startDate}
                  onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>End</Label>
                <Input
                  type="date"
                  required
                  value={form.endDate}
                  onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <Label htmlFor="vat">VAT applicable</Label>
              <Switch
                id="vat"
                checked={form.isVatApplicable}
                onCheckedChange={(checked) =>
                  setForm((f) => ({ ...f, isVatApplicable: Boolean(checked) }))
                }
              />
            </div>
            <DialogFooter>
              <Button type="submit">Create</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
