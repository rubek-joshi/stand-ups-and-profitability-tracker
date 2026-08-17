import * as React from "react"
import { Link, createFileRoute } from "@tanstack/react-router"
import { IconTrash, IconUserMinus } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
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
import { useConfirmDialog } from "@/components/confirm-dialog"
import { ErrorState, LoadingState } from "@/components/ui-states"
import { EmployeeLink } from "@/components/resource-link"
import {
  TableActionButton,
  TableActionsCell,
  TableActionsHead,
} from "@/components/table-row-actions"
import { api, ApiError, type Envelope } from "@/lib/api"
import { DEFAULT_LIST_SEARCH } from "@/lib/list-query"
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
  const [employeeId, setEmployeeId] = React.useState("")
  const [name, setName] = React.useState("")
  const [description, setDescription] = React.useState("")
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
  }, [load])

  if (loading) return <LoadingState />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (!group) return null

  const memberIds = new Set((group.members ?? []).map((m) => m.employeeId))
  const available = employees.filter((e) => !memberIds.has(e.id))

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

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-3"
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
                } catch (err) {
                  alert(err instanceof ApiError ? err.message : "Save failed")
                } finally {
                  setSaving(false)
                }
              }}
            >
              <div className="grid gap-2">
                <Label htmlFor="edit-group-name">Name</Label>
                <Input
                  id="edit-group-name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-group-desc">Description</Label>
                <Textarea
                  id="edit-group-desc"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Members ({group.members?.length ?? 0})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Select
                value={employeeId || null}
                onValueChange={(v) => setEmployeeId(v ?? "")}
                items={Object.fromEntries(
                  available.map((e) => [e.id, `${e.name} · ${e.email}`]),
                )}
                disabled={available.length === 0}
              >
                <SelectTrigger className="w-72">
                  <SelectValue
                    placeholder={
                      available.length === 0
                        ? "All active employees added"
                        : "Add employee"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {available.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name} · {e.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                disabled={!employeeId}
                onClick={async () => {
                  try {
                    const res = await api<Envelope<EmployeeGroup>>(
                      `/employee-groups/${id}/members`,
                      { method: "POST", body: { employeeId } },
                    )
                    setGroup(res.data)
                    setEmployeeId("")
                  } catch (e) {
                    alert(e instanceof ApiError ? e.message : "Failed to add")
                  }
                }}
              >
                Add
              </Button>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableActionsHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(group.members ?? []).map((m) => (
                  <TableRow key={m.employeeId}>
                    <TableCell>
                      <EmployeeLink id={m.employeeId}>
                        {m.employee.name}
                      </EmployeeLink>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {m.employee.email}
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
                              e instanceof ApiError
                                ? e.message
                                : "Failed to remove",
                            )
                          }
                        }}
                      >
                        <IconUserMinus className="size-3.5" />
                      </TableActionButton>
                    </TableActionsCell>
                  </TableRow>
                ))}
                {(group.members ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground">
                      No members yet.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
      {dialog}
    </div>
  )
}
