import * as React from "react"
import { createFileRoute } from "@tanstack/react-router"
import { IconExternalLink } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { Label } from "@workspace/ui/components/label"
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
import { PaginationBar } from "@/components/pagination-bar"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui-states"
import { EntityLink } from "@/components/resource-link"
import {
  TableActionLink,
  TableActionsCell,
  TableActionsHead,
} from "@/components/table-row-actions"
import { api, ApiError, type Envelope, type PaginatedEnvelope } from "@/lib/api"
import {
  buildListQuery,
  parseOptionalString,
  parsePage,
  parsePageSize,
  totalPagesFor,
} from "@/lib/list-query"
import type { AuditLog } from "@/lib/types"

export const Route = createFileRoute("/_app/audit")({
  validateSearch: (search: Record<string, unknown>) => {
    const action = parseOptionalString(search.action)
    return {
      page: parsePage(search.page),
      pageSize: parsePageSize(search.pageSize),
      action:
        action && ACTIONS.includes(action) ? action : undefined,
      actorId: parseOptionalString(search.actorId),
    }
  },
  component: AuditPage,
})

type AuditActor = {
  id: string
  name: string
  email: string
}

const ACTIONS = [
  "CLIENT_CREATED",
  "CLIENT_UPDATED",
  "CLIENT_DEACTIVATED",
  "CLIENT_DELETED",
  "PROJECT_CREATED",
  "PROJECT_UPDATED",
  "PROJECT_CLOSED",
  "PROJECT_EXTENDED",
  "EMPLOYEE_CREATED",
  "EMPLOYEE_SALARY_UPDATED",
  "STANDUP_COMPLETED",
  "VAT_CLEARED",
  "SETTINGS_UPDATED",
  "AMC_SET",
  "AMC_CANCELLED",
  "USER_LOGIN",
  "USER_CREATED",
  "USER_UPDATED",
  "USER_DEACTIVATED",
  "USER_REACTIVATED",
  "USER_PASSWORD_CHANGED",
]

const ENTITY_ROUTES: Record<string, string> = {
  Client: "/clients/$id",
  Project: "/projects/$id",
  Employee: "/employees/$id",
  CoreMember: "/core-members/$id",
  Standup: "/stand-ups/$id",
}

function AuditPage() {
  const navigate = Route.useNavigate()
  const { page, pageSize, action, actorId } = Route.useSearch()
  const [logs, setLogs] = React.useState<AuditLog[]>([])
  const [actors, setActors] = React.useState<AuditActor[]>([])
  const [total, setTotal] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const actorItems = React.useMemo(
    () =>
      Object.fromEntries(
        actors.map((a) => [a.id, a.name?.trim() ? `${a.name} (${a.email})` : a.email]),
      ),
    [actors],
  )

  const loadActors = React.useCallback(async () => {
    try {
      const res = await api<Envelope<AuditActor[]>>("/audit/actors")
      setActors(res.data)
    } catch {
      setActors([])
    }
  }, [])

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = buildListQuery({
        action: action || undefined,
        actorId: actorId || undefined,
        page,
        pageSize,
      })
      const res = await api<PaginatedEnvelope<AuditLog[]>>(`/audit?${qs}`)
      setLogs(res.data)
      setTotal(res.meta?.total ?? res.data.length)
    } catch (e) {
      setLogs([])
      setTotal(0)
      setError(
        e instanceof ApiError
          ? e.status === 403
            ? "Audit logs are available to super admins only."
            : e.message
          : "Failed to load audit logs",
      )
    } finally {
      setLoading(false)
    }
  }, [action, actorId, page, pageSize])

  React.useEffect(() => {
    void loadActors()
  }, [loadActors])

  React.useEffect(() => {
    void load()
  }, [load])

  return (
    <div>
      <PageHeader
        title="Audit"
        description="Tamper-evident action history"
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Action</Label>
              <Select
                value={action || null}
                onValueChange={(v) => {
                  void navigate({
                    search: (prev) => ({
                      ...prev,
                      action: v || undefined,
                      page: 1,
                    }),
                  })
                }}
                items={Object.fromEntries(ACTIONS.map((a) => [a, a]))}
              >
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="All actions" />
                </SelectTrigger>
                <SelectContent>
                  {ACTIONS.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Actor</Label>
              <Select
                value={actorId || null}
                onValueChange={(v) => {
                  void navigate({
                    search: (prev) => ({
                      ...prev,
                      actorId: v || undefined,
                      page: 1,
                    }),
                  })
                }}
                items={actorItems}
              >
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="All actors" />
                </SelectTrigger>
                <SelectContent>
                  {actors.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name?.trim() ? `${a.name} (${a.email})` : a.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {action || actorId ? (
              <Button
                variant="outline"
                onClick={() => {
                  void navigate({
                    search: (prev) => ({
                      ...prev,
                      action: undefined,
                      actorId: undefined,
                      page: 1,
                    }),
                  })
                }}
              >
                Clear
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => void load()}>
              Refresh
            </Button>
          </div>
        }
      />

      {loading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!loading && !error && logs.length === 0 ? (
        <EmptyState message="No audit entries" />
      ) : null}
      {!loading && logs.length > 0 ? (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Summary</TableHead>
                  <TableActionsHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => {
                  const type = log.targetType ?? log.entityType ?? ""
                  const entityId = log.targetId ?? log.entityId ?? ""
                  const entityRoute = entityId ? ENTITY_ROUTES[type] : undefined
                  const label = `${type} · ${entityId.slice(0, 8)}…`

                  return (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {new Date(log.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{log.action}</TableCell>
                      <TableCell>{log.actor?.name ?? log.actor?.email ?? "—"}</TableCell>
                      <TableCell className="text-sm">
                        {entityId ? (
                          <EntityLink type={type} id={entityId}>
                            {label}
                          </EntityLink>
                        ) : (
                          label
                        )}
                      </TableCell>
                      <TableCell className="max-w-md truncate text-sm text-muted-foreground">
                        {log.summary || "—"}
                      </TableCell>
                      <TableActionsCell>
                        {entityRoute ? (
                          <TableActionLink
                            label="Open entity"
                            to={entityRoute}
                            params={{ id: entityId }}
                          >
                            <IconExternalLink className="size-3.5" />
                          </TableActionLink>
                        ) : null}
                      </TableActionsCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          <PaginationBar
            page={page}
            totalPages={totalPagesFor(total, pageSize)}
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
    </div>
  )
}
