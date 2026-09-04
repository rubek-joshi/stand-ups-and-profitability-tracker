import * as React from "react"
import { Link, createFileRoute } from "@tanstack/react-router"
import { IconEye, IconPencil, IconSearch } from "@tabler/icons-react"
import { Badge } from "@workspace/ui/components/badge"
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
import { JoinedDate } from "@/components/joined-date"
import { DateInput } from "@/components/datetime-picker"
import { api, ApiError, type PaginatedEnvelope } from "@/lib/api"
import { buildListQuery, parseListSearch, totalPagesFor } from "@/lib/list-query"
import { formatNpr, parseNprInput } from "@/lib/money"
import type { Employee } from "@/lib/types"

export const Route = createFileRoute("/_app/employees/")({
  validateSearch: (search: Record<string, unknown>) => parseListSearch(search),
  component: EmployeesPage,
})

function EmployeesPage() {
  const navigate = Route.useNavigate()
  const { q, page, pageSize } = Route.useSearch()
  const [items, setItems] = React.useState<Employee[]>([])
  const [total, setTotal] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState(false)
  const [form, setForm] = React.useState({
    name: "",
    email: "",
    contactNumber: "",
    panNumber: "",
    dateJoined: new Date().toISOString().slice(0, 10),
    dateOfBirth: "",
    initialSalaryNpr: "",
  })
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
      const res = await api<PaginatedEnvelope<Employee[]>>(`/employees?${qs}`)
      setItems(res.data)
      setTotal(res.meta?.total ?? res.data.length)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load employees")
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
        title="Employees"
        description="Team members who participate in stand-ups"
        actions={<Button onClick={() => setOpen(true)}>New employee</Button>}
      />

      <div className="mb-4">
        <div className="relative max-w-sm">
          <IconSearch className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search by name or email…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
      </div>

      {loading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!loading && items.length === 0 ? (
        <EmptyState message={q ? "No employees match your search" : "No employees"} />
      ) : null}
      {items.length > 0 ? (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Groups</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableActionsHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((e) => (
                  <NavigableTableRow
                    key={e.id}
                    to="/employees/$id"
                    params={{ id: e.id }}
                  >
                    <TableCell>
                      <Link
                        to="/employees/$id"
                        params={{ id: e.id }}
                        className="font-medium hover:underline"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {e.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <MailLink value={e.email} withCopy="hover" />
                    </TableCell>
                    <TableCell>
                      {e.contactNumber ? (
                        <TelLink value={e.contactNumber} withCopy="hover" />
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {(e.groups ?? []).length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {(e.groups ?? []).map((g) => (
                            <Link
                              key={g.id}
                              to="/employee-groups/$id"
                              params={{ id: g.id }}
                              onClick={(event) => event.stopPropagation()}
                            >
                              <Badge variant="secondary">{g.name}</Badge>
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={e.status} />
                    </TableCell>
                    <TableCell>
                      <JoinedDate value={e.dateJoined} />
                    </TableCell>
                    <TableActionsCell>
                      <TableActionLink
                        label="View"
                        to="/employees/$id"
                        params={{ id: e.id }}
                      >
                        <IconEye className="size-3.5" />
                      </TableActionLink>
                      <TableActionLink
                        label="Edit"
                        to="/employees/$id/edit"
                        params={{ id: e.id }}
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
            <DialogTitle>Create employee</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={async (ev) => {
              ev.preventDefault()
              const today = new Date().toISOString().slice(0, 10)
              if (form.dateOfBirth && form.dateOfBirth > today) {
                alert("Date of birth cannot be in the future")
                return
              }
              try {
                await api("/employees", {
                  method: "POST",
                  body: {
                    name: form.name.trim(),
                    email: form.email.trim(),
                    contactNumber: form.contactNumber.trim() || undefined,
                    panNumber: form.panNumber.trim() || undefined,
                    dateJoined: form.dateJoined,
                    dateOfBirth: form.dateOfBirth || undefined,
                    initialSalaryNpr: form.initialSalaryNpr
                      ? parseNprInput(form.initialSalaryNpr)
                      : undefined,
                  },
                })
                setOpen(false)
                setForm({
                  name: "",
                  email: "",
                  contactNumber: "",
                  panNumber: "",
                  dateJoined: new Date().toISOString().slice(0, 10),
                  dateOfBirth: "",
                  initialSalaryNpr: "",
                })
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
              <Label>Date of birth (optional)</Label>
              <DateInput
                clearable
                max={new Date().toISOString().slice(0, 10)}
                value={form.dateOfBirth}
                onChange={(next) =>
                  setForm((f) => ({ ...f, dateOfBirth: next ?? "" }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Initial salary (NPR)</Label>
              <Input
                value={form.initialSalaryNpr}
                onChange={(e) => setForm((f) => ({ ...f, initialSalaryNpr: e.target.value }))}
                placeholder="Optional"
              />
              {form.initialSalaryNpr ? (
                <p className="text-xs text-muted-foreground">
                  Preview: {formatNpr(String(Math.round(Number(form.initialSalaryNpr || 0) * 100)))}
                </p>
              ) : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Create</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
