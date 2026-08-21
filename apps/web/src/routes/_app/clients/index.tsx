import * as React from "react"
import { Link, createFileRoute } from "@tanstack/react-router"
import { IconEye, IconPencil, IconSearch } from "@tabler/icons-react"
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
import { PaginationBar } from "@/components/pagination-bar"
import { StatusBadge } from "@/components/health-badge"
import { MailLink, TelLink } from "@/components/contact-link"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui-states"
import {
  NavigableTableRow,
  TableActionLink,
  TableActionsCell,
  TableActionsHead,
} from "@/components/table-row-actions"
import { api, ApiError, type PaginatedEnvelope } from "@/lib/api"
import { buildListQuery, parseListSearch, totalPagesFor } from "@/lib/list-query"
import type { Client } from "@/lib/types"

export const Route = createFileRoute("/_app/clients/")({
  validateSearch: (search: Record<string, unknown>) => parseListSearch(search),
  component: ClientsPage,
})

function ClientsPage() {
  const navigate = Route.useNavigate()
  const { q, page, pageSize } = Route.useSearch()
  const [clients, setClients] = React.useState<Client[]>([])
  const [total, setTotal] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [phone, setPhone] = React.useState("")
  const [additionalInfo, setAdditionalInfo] = React.useState("")
  const [saving, setSaving] = React.useState(false)
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
      const qs = buildListQuery({ q, page, pageSize })
      const res = await api<PaginatedEnvelope<Client[]>>(`/clients?${qs}`)
      setClients(res.data)
      setTotal(res.meta?.total ?? res.data.length)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load clients")
    } finally {
      setLoading(false)
    }
  }, [q, page, pageSize])

  React.useEffect(() => {
    void load()
  }, [load])

  const totalPages = totalPagesFor(total, pageSize)

  return (
    <div>
      <PageHeader
        title="Clients"
        description="Manage client accounts"
        actions={<Button onClick={() => setOpen(true)}>New client</Button>}
      />

      <div className="mb-4">
        <div className="relative max-w-sm">
          <IconSearch className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search clients…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
      </div>

      {loading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!loading && !error && clients.length === 0 ? (
        <EmptyState message={q ? "No clients match your search" : "No clients yet"} />
      ) : null}
      {!loading && clients.length > 0 ? (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Projects</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableActionsHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.map((c) => (
                  <NavigableTableRow
                    key={c.id}
                    to="/clients/$id"
                    params={{ id: c.id }}
                  >
                    <TableCell>
                      <Link
                        to="/clients/$id"
                        params={{ id: c.id }}
                        className="font-medium hover:underline"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {c.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={c.status} />
                    </TableCell>
                    <TableCell>{c._count?.projects ?? "—"}</TableCell>
                    <TableCell>
                      {c.phone ? <TelLink value={c.phone} withCopy="hover" /> : "—"}
                    </TableCell>
                    <TableCell>
                      {c.email ? <MailLink value={c.email} withCopy="hover" /> : "—"}
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
                  body: {
                    name: name.trim(),
                    email: email.trim() || undefined,
                    phone: phone.trim() || undefined,
                    additionalInfo: additionalInfo.trim() || undefined,
                  },
                })
                setOpen(false)
                setName("")
                setEmail("")
                setPhone("")
                setAdditionalInfo("")
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
              <Label htmlFor="client-email">Email (optional)</Label>
              <Input
                id="client-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-phone">Phone (optional)</Label>
              <Input
                id="client-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact">Additional info (optional)</Label>
              <Textarea
                id="contact"
                value={additionalInfo}
                onChange={(e) => setAdditionalInfo(e.target.value)}
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
