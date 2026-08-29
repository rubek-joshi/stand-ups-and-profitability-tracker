import * as React from "react"
import { Link, createFileRoute } from "@tanstack/react-router"
import {
  IconChevronDown,
  IconChevronUp,
  IconEye,
  IconPencil,
  IconSearch,
  IconSelector,
} from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
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
import { PaginationBar } from "@/components/pagination-bar"
import { StatusBadge } from "@/components/health-badge"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui-states"
import {
  NavigableTableRow,
  TableActionLink,
  TableActionsCell,
  TableActionsHead,
} from "@/components/table-row-actions"
import { api, ApiError, type PaginatedEnvelope } from "@/lib/api"
import {
  buildListQuery,
  parseListSearch,
  parseOptionalString,
  parseSortDir,
  totalPagesFor,
  type SortDir,
} from "@/lib/list-query"
import { formatNpr } from "@/lib/money"
import type { Project } from "@/lib/types"

const PROJECT_STATUSES = ["active", "extended", "closed", "under_amc"] as const
const PROJECT_SORT_FIELDS = [
  "name",
  "client",
  "status",
  "budget",
  "startDate",
] as const

type ProjectSortBy = (typeof PROJECT_SORT_FIELDS)[number]

function parseProjectSortBy(value: unknown): ProjectSortBy | undefined {
  return PROJECT_SORT_FIELDS.includes(value as ProjectSortBy)
    ? (value as ProjectSortBy)
    : undefined
}

function defaultSortDir(column: ProjectSortBy): SortDir {
  return column === "name" || column === "client" || column === "status"
    ? "asc"
    : "desc"
}

export const Route = createFileRoute("/_app/projects/")({
  validateSearch: (search: Record<string, unknown>) => {
    const base = parseListSearch(search)
    const status = parseOptionalString(search.status)
    const sortBy = parseProjectSortBy(search.sortBy)
    const sortDir = parseSortDir(search.sortDir)
    return {
      ...base,
      status:
        status && (PROJECT_STATUSES as readonly string[]).includes(status)
          ? status
          : undefined,
      sortBy,
      sortDir: sortBy ? (sortDir ?? defaultSortDir(sortBy)) : undefined,
    }
  },
  component: ProjectsPage,
})

function ProjectsPage() {
  const navigate = Route.useNavigate()
  const { q, page, pageSize, status, sortBy, sortDir } = Route.useSearch()
  const [projects, setProjects] = React.useState<Project[]>([])
  const [total, setTotal] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState(false)
  const [searchInput, setSearchInput] = React.useState(q ?? "")

  React.useEffect(() => {
    setSearchInput(q ?? "")
  }, [q])

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = searchInput.trim() || undefined
      if (next === q) return
      void navigate({
        search: (prev) => ({ ...prev, q: next, page: 1 }),
        replace: true,
      })
    }, 300)
    return () => window.clearTimeout(timer)
  }, [searchInput, q, navigate])

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = buildListQuery({
        q,
        page,
        pageSize,
        status: status || undefined,
        sortBy,
        sortDir,
      })
      const p = await api<PaginatedEnvelope<Project[]>>(`/projects?${qs}`)
      setProjects(p.data)
      setTotal(p.meta?.total ?? p.data.length)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load projects")
    } finally {
      setLoading(false)
    }
  }, [q, page, pageSize, status, sortBy, sortDir])

  React.useEffect(() => {
    void load()
  }, [load])

  const totalPages = totalPagesFor(total, pageSize)

  const toggleSort = (column: ProjectSortBy) => {
    void navigate({
      search: (prev) => {
        if (prev.sortBy !== column) {
          return {
            ...prev,
            sortBy: column,
            sortDir: defaultSortDir(column),
            page: 1,
          }
        }
        return {
          ...prev,
          sortBy: column,
          sortDir: prev.sortDir === "desc" ? "asc" : "desc",
          page: 1,
        }
      },
    })
  }

  return (
    <div>
      <PageHeader
        title="Projects"
        description="Budgets, assignments, and profitability"
        actions={<Button onClick={() => setOpen(true)}>New project</Button>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 max-w-sm flex-1">
          <IconSearch className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search projects or clients…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <Select
          value={status || null}
          onValueChange={(v) => {
            void navigate({
              search: (prev) => ({
                ...prev,
                status: v || undefined,
                page: 1,
              }),
            })
          }}
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
        {status ? (
          <Button
            variant="outline"
            onClick={() => {
              void navigate({
                search: (prev) => ({
                  ...prev,
                  status: undefined,
                  page: 1,
                }),
              })
            }}
          >
            Clear filter
          </Button>
        ) : null}
      </div>

      {loading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!loading && projects.length === 0 ? (
        <EmptyState
          message={q || status ? "No projects match your filters" : "No projects"}
        />
      ) : null}
      {projects.length > 0 ? (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead
                    label="Name"
                    column="name"
                    active={sortBy === "name"}
                    dir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTableHead
                    label="Client"
                    column="client"
                    active={sortBy === "client"}
                    dir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTableHead
                    label="Status"
                    column="status"
                    active={sortBy === "status"}
                    dir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTableHead
                    label="Budget"
                    column="budget"
                    active={sortBy === "budget"}
                    dir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTableHead
                    label="Dates"
                    column="startDate"
                    active={sortBy === "startDate"}
                    dir={sortDir}
                    onSort={toggleSort}
                  />
                  <TableActionsHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((p) => (
                  <NavigableTableRow
                    key={p.id}
                    to="/projects/$id"
                    params={{ id: p.id }}
                  >
                    <TableCell>
                      <Link
                        to="/projects/$id"
                        params={{ id: p.id }}
                        className="font-medium hover:underline"
                        onClick={(event) => event.stopPropagation()}
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
                          onClick={(event) => event.stopPropagation()}
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
                  </NavigableTableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <PaginationBar
            page={page}
            totalPages={totalPages}
            total={total}
            pageSize={pageSize}
            onPageChange={(nextPage) => {
              void navigate({
                search: (prev) => ({ ...prev, page: nextPage }),
              })
            }}
            onPageSizeChange={(size) => {
              void navigate({
                search: (prev) => ({ ...prev, pageSize: size, page: 1 }),
              })
            }}
          />
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

function SortableTableHead({
  label,
  column,
  active,
  dir,
  onSort,
}: {
  label: string
  column: ProjectSortBy
  active: boolean
  dir?: SortDir
  onSort: (column: ProjectSortBy) => void
}) {
  const sortState = active ? (dir === "asc" ? "ascending" : "descending") : "none"
  const Icon = !active
    ? IconSelector
    : dir === "asc"
      ? IconChevronUp
      : IconChevronDown
  return (
    <TableHead aria-sort={sortState}>
      <button
        type="button"
        className="inline-flex items-center gap-1 font-medium hover:text-foreground"
        onClick={() => onSort(column)}
        aria-label={
          active
            ? `Sort by ${label}, currently ${sortState}. Click to reverse.`
            : `Sort by ${label}`
        }
      >
        {label}
        <Icon
          className={
            active
              ? "size-3.5 text-foreground"
              : "size-3.5 text-muted-foreground"
          }
        />
      </button>
    </TableHead>
  )
}
