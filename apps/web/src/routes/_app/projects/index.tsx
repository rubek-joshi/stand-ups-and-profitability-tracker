import * as React from "react"
import { Link, createFileRoute } from "@tanstack/react-router"
import { IconEye, IconPencil } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
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
import { CreateProjectDialog } from "@/components/create-project-dialog"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/health-badge"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui-states"
import {
  TableActionLink,
  TableActionsCell,
  TableActionsHead,
} from "@/components/table-row-actions"
import { api, ApiError, type Envelope } from "@/lib/api"
import { formatNpr } from "@/lib/money"
import type { Project } from "@/lib/types"

export const Route = createFileRoute("/_app/projects/")({
  component: ProjectsPage,
})

function ProjectsPage() {
  const [projects, setProjects] = React.useState<Project[]>([])
  const [statusFilter, setStatusFilter] = React.useState<string>("")
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = statusFilter ? `?status=${statusFilter}` : ""
      const p = await api<Envelope<Project[]>>(`/projects${qs}`)
      setProjects(p.data)
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
              value={statusFilter || null}
              onValueChange={(v) => setStatusFilter(v ?? "")}
              items={{
                active: "Active",
                extended: "Extended",
                closed: "Closed",
                under_amc: "Under AMC",
              }}
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
                <TableActionsHead />
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
                  <TableCell>
                    {p.client?.id ? (
                      <Link
                        to="/clients/$id"
                        params={{ id: p.client.id }}
                        className="hover:underline"
                      >
                        {p.client.name}
                      </Link>
                    ) : (
                      (p.client?.name ?? "—")
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={p.status} />
                  </TableCell>
                  <TableCell className="tabular-nums">{formatNpr(p.budgetPaisa)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {String(p.startDate).slice(0, 10)} → {String(p.endDate).slice(0, 10)}
                  </TableCell>
                  <TableActionsCell>
                    <TableActionLink
                      label="View"
                      to="/projects/$id"
                      params={{ id: p.id }}
                    >
                      <IconEye className="size-3.5" />
                    </TableActionLink>
                    <TableActionLink
                      label="Edit"
                      to="/projects/$id/edit"
                      params={{ id: p.id }}
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

      <CreateProjectDialog
        open={open}
        onOpenChange={setOpen}
        onCreated={() => load()}
      />
    </div>
  )
}
