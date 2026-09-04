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
import { MailLink, TelLink } from "@/components/contact-link"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui-states"
import {
  NavigableTableRow,
  TableActionLink,
  TableActionsCell,
  TableActionsHead,
} from "@/components/table-row-actions"
import { JoinedDate } from "@/components/joined-date"
import { DateInput } from "@/components/datetime-picker"
import { api, ApiError, type Envelope } from "@/lib/api"
import { parseNprInput } from "@/lib/money"
import type { CoreMember } from "@/lib/types"

export const Route = createFileRoute("/_app/core-members/")({
  component: CoreMembersPage,
})

function emptyForm() {
  return {
    name: "",
    email: "",
    contactNumber: "",
    panNumber: "",
    dateJoined: new Date().toISOString().slice(0, 10),
    initialSalaryNpr: "",
  }
}

function CoreMembersPage() {
  const [items, setItems] = React.useState<CoreMember[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState(false)
  const [form, setForm] = React.useState(emptyForm)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api<Envelope<CoreMember[]>>("/core-members")
      setItems(res.data)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) setForm(emptyForm())
  }

  return (
    <div>
      <PageHeader
        title="Core Members"
        description="Always-on cost contributors (not in stand-ups)"
        actions={<Button onClick={() => handleOpenChange(true)}>New core member</Button>}
      />
      {loading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!loading && items.length === 0 ? <EmptyState message="No core members" /> : null}
      {items.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
                <TableActionsHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((m) => (
                <NavigableTableRow
                  key={m.id}
                  to="/core-members/$id"
                  params={{ id: m.id }}
                >
                  <TableCell>
                    <Link
                      to="/core-members/$id"
                      params={{ id: m.id }}
                      className="font-medium hover:underline"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {m.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <MailLink value={m.email} withCopy="hover" />
                  </TableCell>
                  <TableCell>
                    {m.contactNumber ? (
                      <TelLink value={m.contactNumber} withCopy="hover" />
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={m.status} />
                  </TableCell>
                  <TableCell>
                    <JoinedDate value={m.dateJoined} />
                  </TableCell>
                  <TableActionsCell>
                    <TableActionLink
                      label="View"
                      to="/core-members/$id"
                      params={{ id: m.id }}
                    >
                      <IconEye className="size-3.5" />
                    </TableActionLink>
                    <TableActionLink
                      label="Edit"
                      to="/core-members/$id/edit"
                      params={{ id: m.id }}
                    >
                      <IconPencil className="size-3.5" />
                    </TableActionLink>
                  </TableActionsCell>
                </NavigableTableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create core member</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault()
              try {
                await api("/core-members", {
                  method: "POST",
                  body: {
                    name: form.name.trim(),
                    email: form.email.trim(),
                    contactNumber: form.contactNumber.trim() || undefined,
                    panNumber: form.panNumber.trim() || undefined,
                    dateJoined: form.dateJoined,
                    initialSalaryNpr: form.initialSalaryNpr
                      ? parseNprInput(form.initialSalaryNpr)
                      : undefined,
                  },
                })
                setForm(emptyForm())
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
              <Label>Contact number (optional)</Label>
              <Input
                type="tel"
                value={form.contactNumber}
                onChange={(e) => setForm((f) => ({ ...f, contactNumber: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>PAN number (optional)</Label>
              <Input
                value={form.panNumber}
                maxLength={20}
                onChange={(e) => setForm((f) => ({ ...f, panNumber: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Date joined</Label>
              <DateInput
                value={form.dateJoined}
                onChange={(next) =>
                  setForm((f) => ({ ...f, dateJoined: next ?? "" }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Initial salary (NPR)</Label>
              <Input
                value={form.initialSalaryNpr}
                onChange={(e) => setForm((f) => ({ ...f, initialSalaryNpr: e.target.value }))}
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
