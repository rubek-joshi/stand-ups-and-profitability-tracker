import * as React from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import {
  IconDotsVertical,
  IconPencil,
  IconTrash,
  IconUserOff,
} from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/health-badge"
import { MailLink, TelLink } from "@/components/contact-link"
import { useConfirmDialog } from "@/components/confirm-dialog"
import { MarkLeftDialog } from "@/components/mark-left-dialog"
import { ErrorState, LoadingState } from "@/components/ui-states"
import { TableActionLink } from "@/components/table-row-actions"
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
  const canDelete = entries.length === 0

  return (
    <div>
      <PageHeader
        title={member.name}
        description={member.email}
        breadcrumbs={[
          { label: "Core Members", to: "/core-members" },
          { label: member.name },
        ]}
        status={<StatusBadge status={member.status} />}
        actions={
          <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Core member actions"
                  />
                }
              >
                <IconDotsVertical />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-40">
                <DropdownMenuGroup>
                  {member.status === "active" ? (
                    <DropdownMenuItem onClick={() => setMarkLeftOpen(true)}>
                      <IconUserOff />
                      Mark left
                    </DropdownMenuItem>
                  ) : null}
                  {canDelete ? (
                    <DropdownMenuItem
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
                      <IconTrash />
                      Delete
                    </DropdownMenuItem>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger
                        render={<div className="w-full cursor-not-allowed" />}
                      >
                        <DropdownMenuItem disabled variant="destructive">
                          <IconTrash />
                          Delete
                        </DropdownMenuItem>
                      </TooltipTrigger>
                      <TooltipContent>
                        Cannot delete: core member has salary history
                      </TooltipContent>
                    </Tooltip>
                  )}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <section className="min-w-0">
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
        </section>

        <aside className="lg:sticky lg:top-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">Profile</CardTitle>
              <TableActionLink
                label="Edit details"
                to="/core-members/$id/edit"
                params={{ id }}
              >
                <IconPencil className="size-3.5" />
              </TableActionLink>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <Detail label="Name" value={member.name} />
              <Detail
                label="Email"
                value={<MailLink value={member.email} withCopy />}
              />
              <Detail
                label="Contact number"
                value={
                  member.contactNumber ? (
                    <TelLink value={member.contactNumber} withCopy />
                  ) : (
                    "—"
                  )
                }
              />
              <Detail
                label="Joined"
                value={String(member.dateJoined).slice(0, 10)}
              />
              <Detail
                label="Left"
                value={
                  member.dateLeft ? String(member.dateLeft).slice(0, 10) : "—"
                }
              />
            </CardContent>
          </Card>
        </aside>
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

function Detail({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{value}</dd>
    </div>
  )
}
