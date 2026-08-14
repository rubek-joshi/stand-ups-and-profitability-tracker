import * as React from "react"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { Button, buttonVariants } from "@workspace/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
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
import { useConfirmDialog } from "@/components/confirm-dialog"
import { ErrorState, LoadingState } from "@/components/ui-states"
import { api, ApiError, type Envelope } from "@/lib/api"
import { formatNpr } from "@/lib/money"
import type { Employee } from "@/lib/types"

export const Route = createFileRoute("/_app/employees/$id")({
  component: EmployeeDetailPage,
})

function EmployeeDetailPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const { confirm, dialog } = useConfirmDialog()
  const [employee, setEmployee] = React.useState<Employee | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api<Envelope<Employee>>(`/employees/${id}`)
      setEmployee(res.data)
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
  if (!employee) return null

  const entries = employee.salaryEntries ?? []

  return (
    <div>
      <PageHeader
        title={employee.name}
        description={employee.email}
        actions={
          <>
            <StatusBadge status={employee.status} />
            <Link
              to="/employees/$id/edit"
              params={{ id }}
              className={buttonVariants()}
            >
              Edit
            </Link>
            {employee.status === "active" ? (
              <Button
                variant="outline"
                onClick={async () => {
                  const dateLeft = window.prompt(
                    "Date left (YYYY-MM-DD)",
                    new Date().toISOString().slice(0, 10),
                  )
                  if (!dateLeft) return
                  await api(`/employees/${id}/mark-left`, {
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
                  title: "Delete employee?",
                  description: "Only allowed if there is no history.",
                  confirmLabel: "Delete",
                  destructive: true,
                })
                if (!ok) return
                try {
                  await api(`/employees/${id}`, { method: "DELETE" })
                  void navigate({ to: "/employees" })
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
          <CardContent className="space-y-3 text-sm">
            <DetailRow label="Name" value={employee.name} />
            <DetailRow label="Email" value={employee.email} />
            <DetailRow label="Joined" value={String(employee.dateJoined).slice(0, 10)} />
            <DetailRow
              label="Left"
              value={employee.dateLeft ? String(employee.dateLeft).slice(0, 10) : "—"}
            />
            <DetailRow label="Status" value={employee.status} />
            {employee.attendanceSummary ? (
              <div className="mt-4 grid grid-cols-2 gap-2">
                {Object.entries(employee.attendanceSummary).map(([k, v]) => (
                  <div key={k} className="rounded-md border px-2 py-1">
                    <span className="text-muted-foreground capitalize">
                      {k.replaceAll("_", " ")}
                    </span>
                    : {v}
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Salary entries</CardTitle>
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>{String(entry.effectiveDate).slice(0, 10)}</TableCell>
                      <TableCell>{formatNpr(entry.salaryPaisa)}</TableCell>
                      <TableCell className="max-w-48 truncate text-muted-foreground">
                        {entry.reason?.trim() || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
      {dialog}
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b py-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium capitalize">{value}</span>
    </div>
  )
}
