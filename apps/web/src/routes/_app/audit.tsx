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
  NavigableTableRow,
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
        action && (ACTIONS as readonly string[]).includes(action)
          ? action
          : undefined,
      actorId: parseOptionalString(search.actorId),
      relatedUserId: parseOptionalString(search.relatedUserId),
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
  "AMC_CANCELLED",
  "AMC_DELETED",
  "AMC_SET",
  "AMC_UPDATED",
  "CATEGORY_CREATED",
  "CATEGORY_DEACTIVATED",
  "CATEGORY_UPDATED",
  "CLIENT_CREATED",
  "CLIENT_DEACTIVATED",
  "CLIENT_DELETED",
  "CLIENT_UPDATED",
  "CORE_MEMBER_ASSIGNED",
  "CORE_MEMBER_CREATED",
  "CORE_MEMBER_DELETED",
  "CORE_MEMBER_MARKED_LEFT",
  "CORE_MEMBER_SALARY_CREATED",
  "CORE_MEMBER_SALARY_DELETED",
  "CORE_MEMBER_SALARY_UPDATED",
  "CORE_MEMBER_UNASSIGNED",
  "CORE_MEMBER_UPDATED",
  "DB_SNAPSHOT_DOWNLOADED",
  "EMPLOYEE_CREATED",
  "EMPLOYEE_DELETED",
  "EMPLOYEE_EMERGENCY_CONTACT_CREATED",
  "EMPLOYEE_EMERGENCY_CONTACT_DELETED",
  "EMPLOYEE_EMERGENCY_CONTACT_UPDATED",
  "EMPLOYEE_GROUP_CREATED",
  "EMPLOYEE_GROUP_DELETED",
  "EMPLOYEE_GROUP_MEMBER_ADDED",
  "EMPLOYEE_GROUP_MEMBER_REMOVED",
  "EMPLOYEE_GROUP_UPDATED",
  "EMPLOYEE_MARKED_LEFT",
  "EMPLOYEE_SALARY_CREATED",
  "EMPLOYEE_SALARY_DELETED",
  "EMPLOYEE_SALARY_UPDATED",
  "EMPLOYEE_UPDATED",
  "INVOICE_CREATED",
  "INVOICE_DELETED",
  "INVOICE_MARKED_PAID",
  "INVOICE_UPDATED",
  "PROJECT_ASSIGNMENT_CREATED",
  "PROJECT_ASSIGNMENT_ENDED",
  "PROJECT_AUTO_EXTENDED",
  "PROJECT_CLOSED",
  "PROJECT_CREATED",
  "PROJECT_DELETED",
  "PROJECT_EXTENDED",
  "PROJECT_UPDATED",
  "SETTINGS_UPDATED",
  "STANDUP_COMPLETED",
  "STANDUP_CREATED",
  "STANDUP_OVERRIDE_GRANTED",
  "STANDUP_REOPENED",
  "STANDUP_UPDATED",
  "USER_CREATED",
  "USER_DEACTIVATED",
  "USER_LOGIN",
  "USER_PASSWORD_CHANGED",
  "USER_REACTIVATED",
  "USER_UPDATED",
  "VAT_CLEARED",
] as const

const ENTITY_ROUTES: Record<string, string> = {
  Client: "/clients/$id",
  Invoice: "/invoices/$id",
  Project: "/projects/$id",
  Employee: "/employees/$id",
  CoreMember: "/core-members/$id",
  Standup: "/stand-ups/$id",
  User: "/users/$id",
}

function AuditPage() {
  const navigate = Route.useNavigate()
  const { page, pageSize, action, actorId, relatedUserId } = Route.useSearch()
  const [logs, setLogs] = React.useState<AuditLog[]>([])
  const [actors, setActors] = React.useState<AuditActor[]>([])
  const [total, setTotal] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const actorItems = React.useMemo(
    () =>
      Object.fromEntries(
        actors.map((a) => [
          a.id,
          a.name?.trim() ? `${a.name} (${a.email})` : a.email,
        ])
      ),
    [actors]
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
        relatedUserId: relatedUserId || undefined,
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
            ? "Audit logs are available to admins only."
            : e.message
          : "Failed to load audit logs"
      )
    } finally {
      setLoading(false)
    }
  }, [action, actorId, relatedUserId, page, pageSize])

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
                <SelectTrigger
                  className="w-80 max-w-full **:data-[slot=select-value]:line-clamp-none **:data-[slot=select-value]:whitespace-normal"
                >
                  <SelectValue placeholder="All actions" />
                </SelectTrigger>
                <SelectContent className="max-h-72 min-w-80 overflow-y-auto">
                  {ACTIONS.map((a) => (
                    <SelectItem
                      key={a}
                      value={a}
                      className="[&>span]:whitespace-normal [&>span]:wrap-break-word"
                    >
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
            <div className="flex gap-1 mb-1">
              {action || actorId || relatedUserId ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    void navigate({
                      search: (prev) => ({
                        ...prev,
                        action: undefined,
                        actorId: undefined,
                        relatedUserId: undefined,
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
          </div>
        }
      />

      {relatedUserId ? (
        <p className="mb-4 text-sm text-muted-foreground">
          Showing actions by or about this user.{" "}
          <Button
            variant="link"
            className="h-auto p-0"
            onClick={() => {
              void navigate({
                search: (prev) => ({ ...prev, relatedUserId: undefined, page: 1 }),
              })
            }}
          >
            Clear user filter
          </Button>
        </p>
      ) : null}

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

                  return entityRoute ? (
                    <NavigableTableRow
                      key={log.id}
                      to={entityRoute}
                      params={{ id: entityId }}
                    >
                      <TableCell className="text-sm whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {log.action}
                      </TableCell>
                      <TableCell>
                        {log.actor?.name ?? log.actor?.email ?? "—"}
                      </TableCell>
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
                        <TableActionLink
                          label="Open entity"
                          to={entityRoute}
                          params={{ id: entityId }}
                        >
                          <IconExternalLink className="size-3.5" />
                        </TableActionLink>
                      </TableActionsCell>
                    </NavigableTableRow>
                  ) : (
                    <TableRow key={log.id}>
                      <TableCell className="text-sm whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {log.action}
                      </TableCell>
                      <TableCell>
                        {log.actor?.name ?? log.actor?.email ?? "—"}
                      </TableCell>
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
                      <TableActionsCell />
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
