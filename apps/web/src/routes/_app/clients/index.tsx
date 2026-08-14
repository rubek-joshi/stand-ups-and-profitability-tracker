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
import { Textarea } from "@workspace/ui/components/textarea"
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
import {
  TableActionLink,
  TableActionsCell,
  TableActionsHead,
} from "@/components/table-row-actions"
import { api, ApiError, type Envelope } from "@/lib/api"
import type { Client } from "@/lib/types"

export const Route = createFileRoute("/_app/clients/")({
  component: ClientsPage,
})

function ClientsPage() {
  const [clients, setClients] = React.useState<Client[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [contactInfo, setContactInfo] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api<Envelope<Client[]>>("/clients")
      setClients(res.data)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load clients")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  return (
    <div>
      <PageHeader
        title="Clients"
        description="Manage client accounts"
        actions={<Button onClick={() => setOpen(true)}>New client</Button>}
      />
      {loading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!loading && !error && clients.length === 0 ? <EmptyState message="No clients yet" /> : null}
      {!loading && clients.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Projects</TableHead>
                <TableHead>Contact</TableHead>
                <TableActionsHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link
                      to="/clients/$id"
                      params={{ id: c.id }}
                      className="font-medium hover:underline"
                    >
                      {c.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={c.status} />
                  </TableCell>
                  <TableCell>{c._count?.projects ?? "—"}</TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">
                    {c.contactInfo || "—"}
                  </TableCell>
                  <TableActionsCell>
                    <TableActionLink
                      label="View"
                      to="/clients/$id"
                      params={{ id: c.id }}
                    >
                      <IconEye className="size-3.5" />
                    </TableActionLink>
                    <TableActionLink
                      label="Edit"
                      to="/clients/$id/edit"
                      params={{ id: c.id }}
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create client</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault()
              setSaving(true)
              try {
                await api("/clients", {
                  method: "POST",
                  body: { name: name.trim(), contactInfo: contactInfo.trim() || undefined },
                })
                setOpen(false)
                setName("")
                setContactInfo("")
                await load()
              } catch (err) {
                alert(err instanceof ApiError ? err.message : "Failed to create")
              } finally {
                setSaving(false)
              }
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact">Contact info</Label>
              <Textarea
                id="contact"
                value={contactInfo}
                onChange={(e) => setContactInfo(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Creating…" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
