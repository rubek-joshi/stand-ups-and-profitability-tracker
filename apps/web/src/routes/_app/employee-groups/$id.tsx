import * as React from "react"
import { Link, createFileRoute } from "@tanstack/react-router"
import { IconPencil, IconTrash, IconUserMinus, IconUserPlus } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
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
import { PaginationBar } from "@/components/pagination-bar"
import { useConfirmDialog } from "@/components/confirm-dialog"
import { ErrorState, LoadingState } from "@/components/ui-states"
import { MailLink, TelLink } from "@/components/contact-link"
import { EmployeeLink } from "@/components/resource-link"
import {
  TableActionButton,
  TableActionsCell,
  TableActionsHead,
} from "@/components/table-row-actions"
import { api, ApiError, type Envelope } from "@/lib/api"
import {
  clampPage,
  DEFAULT_LIST_SEARCH,
  type PageSize,
  totalPagesFor,
} from "@/lib/list-query"
import type { Employee, EmployeeGroup } from "@/lib/types"

export const Route = createFileRoute("/_app/employee-groups/$id")({
  component: EmployeeGroupDetailPage,
})

function EmployeeGroupDetailPage() {
  const { id } = Route.useParams()
  const navigate = Route.useNavigate()
  const { confirm, dialog } = useConfirmDialog()
  const [group, setGroup] = React.useState<EmployeeGroup | null>(null)
  const [employees, setEmployees] = React.useState<Employee[]>([])
  const [addOpen, setAddOpen] = React.useState(false)
  const [addQuery, setAddQuery] = React.useState("")
  const [selectedEmployeeIds, setSelectedEmployeeIds] = React.useState<string[]>([])
  const [addingMembers, setAddingMembers] = React.useState(false)
  const [editing, setEditing] = React.useState(false)
  const [name, setName] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState<PageSize>(25)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [g, emps] = await Promise.all([
        api<Envelope<EmployeeGroup>>(`/employee-groups/${id}`),
        api<Envelope<Employee[]>>("/employees"),
      ])
      setGroup(g.data)
      setName(g.data.name)
      setDescription(g.data.description ?? "")
      setEmployees(emps.data.filter((e) => e.status === "active"))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load group")
    } finally {
      setLoading(false)
    }
  }, [id])

  React.useEffect(() => {
    void load()
    setPage(1)
    setEditing(false)
  }, [load])

  const members = group?.members ?? []
  const totalPages = totalPagesFor(members.length, pageSize)
  const currentPage = clampPage(page, totalPages)

  React.useEffect(() => {
    if (page !== currentPage) setPage(currentPage)
  }, [page, currentPage])

  if (loading) return <LoadingState />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (!group) return null

  const memberIds = new Set(members.map((m) => m.employeeId))
  const available = employees.filter((e) => !memberIds.has(e.id))
  const filteredAvailable = available.filter((employee) => {
    const query = addQuery.trim().toLowerCase()
    if (!query) return true
    return (
      employee.name.toLowerCase().includes(query) ||
      employee.email.toLowerCase().includes(query)
    )
  })
  const allFilteredSelected =
    filteredAvailable.length > 0 &&
    filteredAvailable.every((employee) => selectedEmployeeIds.includes(employee.id))
  const pageMembers = members.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const startEdit = () => {
    setName(group.name)
    setDescription(group.description ?? "")
    setEditing(true)
  }

  const cancelEdit = () => {
    setName(group.name)
    setDescription(group.description ?? "")
    setEditing(false)
  }

  const openAddMembers = () => {
    setAddQuery("")
    setSelectedEmployeeIds([])
    setAddOpen(true)
  }

  const toggleEmployee = (employeeId: string, checked: boolean) => {
    setSelectedEmployeeIds((prev) =>
      checked ? [...prev, employeeId] : prev.filter((id) => id !== employeeId),
    )
  }

  const toggleAllFiltered = (checked: boolean) => {
    if (!checked) {
      const filteredIds = new Set(filteredAvailable.map((employee) => employee.id))
      setSelectedEmployeeIds((prev) => prev.filter((id) => !filteredIds.has(id)))
      return
    }
    setSelectedEmployeeIds((prev) => [
      ...prev,
      ...filteredAvailable
        .map((employee) => employee.id)
        .filter((id) => !prev.includes(id)),
    ])
  }

  const addSelectedMembers = async () => {
    if (selectedEmployeeIds.length === 0) return
    setAddingMembers(true)
    try {
      const res = await api<Envelope<EmployeeGroup>>(
        `/employee-groups/${id}/members/bulk`,
        {
          method: "POST",
          body: { employeeIds: selectedEmployeeIds },
        },
      )
      setGroup(res.data)
      setAddOpen(false)
      setSelectedEmployeeIds([])
      setAddQuery("")
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "Failed to add members")
    } finally {
      setAddingMembers(false)
    }
  }

  return (
    <div>
      <PageHeader
        title={group.name}
        description="Manage group details and members"
        breadcrumbs={[
          { label: "Groups", to: "/employee-groups", search: DEFAULT_LIST_SEARCH },
          { label: group.name },
        ]}
        actions={
          <>
            <Button
              variant="outline"
              render={
                <Link to="/employee-groups" search={{ page: 1, pageSize: 25 }} />
              }
            >
              Back
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                const ok = await confirm({
                  title: "Delete group?",
                  description: `Delete “${group.name}”?`,
                  confirmLabel: "Delete",
                  destructive: true,
                })
                if (!ok) return
                try {
                  await api(`/employee-groups/${id}`, { method: "DELETE" })
                  void navigate({
                    to: "/employee-groups",
                    search: { page: 1, pageSize: 25 },
                  })
                } catch (e) {
                  alert(e instanceof ApiError ? e.message : "Failed to delete")
                }
              }}
            >
              <IconTrash className="size-3.5" />
              Delete
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <Card className="min-w-0">
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle className="text-base">Members ({members.length})</CardTitle>
            <Button disabled={available.length === 0} onClick={openAddMembers}>
              <IconUserPlus className="size-3.5" />
              Add members
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogContent className="max-h-[min(90dvh,36rem)] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Add members</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-3">
                  <Input
                    value={addQuery}
                    onChange={(e) => setAddQuery(e.target.value)}
                    placeholder="Search by name or email…"
                    aria-label="Search employees to add"
                  />
                  {filteredAvailable.length > 0 ? (
                    <label className="flex items-center gap-2 border-b pb-2 text-sm">
                      <Checkbox
                        checked={allFilteredSelected}
                        onCheckedChange={(checked) =>
                          toggleAllFiltered(Boolean(checked))
                        }
                      />
                      Select all shown ({filteredAvailable.length})
                    </label>
                  ) : null}
                  <div className="max-h-72 overflow-y-auto">
                    {filteredAvailable.length === 0 ? (
                      <p className="py-6 text-center text-sm text-muted-foreground">
                        {available.length === 0
                          ? "All active employees are already in this group."
                          : "No employees match your search."}
                      </p>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {filteredAvailable.map((employee) => (
                          <label
                            key={employee.id}
                            className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-muted/60"
                          >
                            <Checkbox
                              checked={selectedEmployeeIds.includes(employee.id)}
                              onCheckedChange={(checked) =>
                                toggleEmployee(employee.id, Boolean(checked))
                              }
                            />
                            <span className="min-w-0">
                              <span className="block text-sm font-medium">
                                {employee.name}
                              </span>
                              <span className="block text-xs text-muted-foreground">
                                {employee.email}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setAddOpen(false)}
                    disabled={addingMembers}
                  >
                    Cancel
                  </Button>
                  <Button
                    disabled={selectedEmployeeIds.length === 0 || addingMembers}
                    onClick={() => void addSelectedMembers()}
                  >
                    {addingMembers
                      ? "Adding…"
                      : `Add ${selectedEmployeeIds.length || ""} member${selectedEmployeeIds.length === 1 ? "" : "s"}`.trim()}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableActionsHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageMembers.map((m) => (
                  <TableRow key={m.employeeId}>
                    <TableCell>
                      <EmployeeLink id={m.employeeId}>{m.employee.name}</EmployeeLink>
                    </TableCell>
                    <TableCell>
                      <MailLink value={m.employee.email} withCopy="hover" />
                    </TableCell>
                    <TableCell>
                      {m.employee.contactNumber ? (
                        <TelLink value={m.employee.contactNumber} withCopy="hover" />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableActionsCell>
                      <TableActionButton
                        label="Remove"
                        variant="destructive"
                        onClick={async () => {
                          try {
                            const res = await api<Envelope<EmployeeGroup>>(
                              `/employee-groups/${id}/members/${m.employeeId}`,
                              { method: "DELETE" },
                            )
                            setGroup(res.data)
                          } catch (e) {
                            alert(
                              e instanceof ApiError ? e.message : "Failed to remove",
                            )
                          }
                        }}
                      >
                        <IconUserMinus className="size-3.5" />
                      </TableActionButton>
                    </TableActionsCell>
                  </TableRow>
                ))}
                {members.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      No members yet.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>

            {members.length > 0 ? (
              <PaginationBar
                page={currentPage}
                totalPages={totalPages}
                total={members.length}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPageSize(size)
                  setPage(1)
                }}
              />
            ) : null}
          </CardContent>
        </Card>

        <aside className="lg:sticky lg:top-6">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
              <CardTitle className="text-base">Details</CardTitle>
              {!editing ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  aria-label="Edit details"
                  onClick={startEdit}
                >
                  <IconPencil className="size-4" />
                </Button>
              ) : null}
            </CardHeader>
            <CardContent>
              {editing ? (
                <form
                  className="flex flex-col gap-3"
                  onSubmit={async (e) => {
                    e.preventDefault()
                    setSaving(true)
                    try {
                      const res = await api<Envelope<EmployeeGroup>>(
                        `/employee-groups/${id}`,
                        {
                          method: "PATCH",
                          body: {
                            name: name.trim(),
                            description: description.trim() || null,
                          },
                        },
                      )
                      setGroup(res.data)
                      setName(res.data.name)
                      setDescription(res.data.description ?? "")
                      setEditing(false)
                    } catch (err) {
                      alert(err instanceof ApiError ? err.message : "Save failed")
                    } finally {
                      setSaving(false)
                    }
                  }}
                >
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="edit-group-name">Name</Label>
                    <Input
                      id="edit-group-name"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="edit-group-desc">Description</Label>
                    <Textarea
                      id="edit-group-desc"
                      rows={4}
                      className="field-sizing-fixed max-h-40"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={saving}>
                      {saving ? "Saving…" : "Save"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={saving}
                      onClick={cancelEdit}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <dl className="flex flex-col gap-4 text-sm">
                  <div className="flex flex-col gap-1">
                    <dt className="text-muted-foreground">Name</dt>
                    <dd className="font-medium">{group.name}</dd>
                  </div>
                  <div className="flex flex-col gap-1">
                    <dt className="text-muted-foreground">Description</dt>
                    <dd className="whitespace-pre-wrap">
                      {group.description?.trim() || "—"}
                    </dd>
                  </div>
                </dl>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
      {dialog}
    </div>
  )
}
