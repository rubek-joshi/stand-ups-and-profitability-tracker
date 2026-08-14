import * as React from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
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
import { EmptyState, ErrorState, LoadingState } from "@/components/ui-states"
import { EntityLink } from "@/components/resource-link"
import { api, ApiError, type PaginatedEnvelope } from "@/lib/api"
import type { AuditLog } from "@/lib/types"

export const Route = createFileRoute("/_app/audit")({
  component: AuditPage,
})

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
]

function AuditPage() {
  const [logs, setLogs] = React.useState<AuditLog[]>([])
  const [total, setTotal] = React.useState(0)
  const [action, setAction] = React.useState("")
  const [actorId, setActorId] = React.useState("")
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (action) params.set("action", action)
      if (actorId.trim()) params.set("actorId", actorId.trim())
      params.set("take", "50")
      const qs = params.toString()
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
  }, [action, actorId])

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
                onValueChange={(v) => setAction(v ?? "")}
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
              <Label className="text-xs">Actor ID</Label>
              <Input
                className="w-48"
                value={actorId}
                onChange={(e) => setActorId(e.target.value)}
                placeholder="user id"
              />
            </div>
            {action || actorId ? (
              <Button
                variant="outline"
                onClick={() => {
                  setAction("")
                  setActorId("")
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
        <>
          <p className="mb-2 text-sm text-muted-foreground">{total} total</p>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Summary</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {new Date(log.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{log.action}</TableCell>
                    <TableCell>{log.actor?.name ?? log.actor?.email ?? "—"}</TableCell>
                    <TableCell className="text-sm">
                      {(() => {
                        const type = log.targetType ?? log.entityType ?? ""
                        const id = log.targetId ?? log.entityId ?? ""
                        const label = `${type} · ${id.slice(0, 8)}…`
                        return id ? (
                          <EntityLink type={type} id={id}>
                            {label}
                          </EntityLink>
                        ) : (
                          label
                        )
                      })()}
                    </TableCell>
                    <TableCell className="max-w-md truncate text-sm text-muted-foreground">
                      {log.summary || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      ) : null}
    </div>
  )
}
