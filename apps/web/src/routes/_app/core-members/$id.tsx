import * as React from "react"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { IconPencil } from "@tabler/icons-react"
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
import { MailLink, TelLink } from "@/components/contact-link"
import { useConfirmDialog } from "@/components/confirm-dialog"
import { MarkLeftDialog } from "@/components/mark-left-dialog"
import { ErrorState, LoadingState } from "@/components/ui-states"
import {
  TableActionLink,
  TableActionsCell,
  TableActionsHead,
} from "@/components/table-row-actions"
import { api, ApiError, type Envelope } from "@/lib/api"
import { formatNpr } from "@/lib/money"
import type { CoreMember } from "@/lib/types"

export const Route = createFileRoute("/_app/core-members/$id")({
  component: CoreMemberDetailPage,
})

function CoreMemberDetailPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const { confirm, dialog } = useConfirmDialog()
  const [markLeftOpen, setMarkLeftOpen] = React.useState(false)
  const [member, setMember] = React.useState<CoreMember | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api<Envelope<CoreMember>>(`/core-members/${id}`)
      setMember(res.data)
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
        breadcrumbs={[
          { label: "Core Members", to: "/core-members" },
          { label: member.name },
        ]}
        actions={
          <>
            <StatusBadge status={member.status} />
            <Link
              to="/core-members/$id/edit"
              params={{ id }}
              className={buttonVariants()}
            >
              Edit
            </Link>
            {member.status === "active" ? (
              <Button variant="outline" onClick={() => setMarkLeftOpen(true)}>
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
          <CardContent className="flex flex-col gap-3 text-sm">
            <DetailRow label="Name" value={member.name} />
            <div className="flex items-center justify-between gap-4 border-b py-2 last:border-0">
              <span className="text-muted-foreground">Email</span>
              <MailLink value={member.email} withCopy />
            </div>
            <div className="flex items-center justify-between gap-4 border-b py-2 last:border-0">
              <span className="text-muted-foreground">Contact number</span>
              {member.contactNumber ? (
                <TelLink value={member.contactNumber} withCopy />
              ) : (
                <span>—</span>
              )}
            </div>
            <DetailRow label="Joined" value={String(member.dateJoined).slice(0, 10)} />
            <DetailRow
              label="Left"
              value={member.dateLeft ? String(member.dateLeft).slice(0, 10) : "—"}
            />
            <DetailRow label="Status" value={member.status} capitalize />
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
                    <TableActionsHead />
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
                      <TableActionsCell>
                        <TableActionLink
                          label="Edit"
                          to="/core-members/$id/edit"
                          params={{ id }}
                        >
                          <IconPencil className="size-3.5" />
                        </TableActionLink>
                      </TableActionsCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
      {dialog}
      <MarkLeftDialog
        open={markLeftOpen}
        onOpenChange={setMarkLeftOpen}
        personName={member.name}
        onConfirm={async (dateLeft) => {
          try {
            await api(`/core-members/${id}/mark-left`, {
              method: "POST",
              body: { dateLeft },
            })
            await load()
          } catch (e) {
            alert(e instanceof ApiError ? e.message : "Failed to mark left")
            throw e
          }
        }}
      />
    </div>
  )
}

function DetailRow({
  label,
  value,
  capitalize,
}: {
  label: string
  value: string
  capitalize?: boolean
}) {
  return (
    <div className="flex justify-between gap-4 border-b py-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-right font-medium${capitalize ? " capitalize" : ""}`}>{value}</span>
    </div>
  )
}
