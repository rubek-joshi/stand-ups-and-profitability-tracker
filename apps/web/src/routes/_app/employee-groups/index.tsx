import * as React from "react"
import { Link, createFileRoute } from "@tanstack/react-router"
import { IconEye, IconSearch, IconTrash } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
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
import { EmptyState, ErrorState, LoadingState } from "@/components/ui-states"
import {
  TableActionButton,
  TableActionLink,
  TableActionsCell,
  TableActionsHead,
} from "@/components/table-row-actions"
import { api, ApiError, type Envelope, type PaginatedEnvelope } from "@/lib/api"
import {
  buildListQuery,
  parseListSearch,
  totalPagesFor,
} from "@/lib/list-query"
import type { EmployeeGroup } from "@/lib/types"

export const Route = createFileRoute("/_app/employee-groups/")({
  validateSearch: (search: Record<string, unknown>) => parseListSearch(search),
  component: EmployeeGroupsPage,
})

function EmployeeGroupsPage() {
  const navigate = Route.useNavigate()
  const { q, page, pageSize } = Route.useSearch()
  const { confirm, dialog } = useConfirmDialog()
  const [groups, setGroups] = React.useState<EmployeeGroup[]>([])
  const [total, setTotal] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [description, setDescription] = React.useState("")
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
      const res = await api<PaginatedEnvelope<EmployeeGroup[]>>(
        `/employee-groups?${qs}`,
      )
      setGroups(res.data)
      setTotal(res.meta?.total ?? res.data.length)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load groups")
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
        title="Groups"
        description="Employee groups and departments for stand-up scoping"
        actions={<Button onClick={() => setOpen(true)}>New group</Button>}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative w-full max-w-sm">
          <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search groups…"
            className="pl-8"
          />
        </div>
      </div>

      {loading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!loading && !error && groups.length === 0 ? (
        <EmptyState message="No groups yet." />
      ) : null}

      {groups.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>Description</TableHead>
                <TableActionsHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((g) => (
                <TableRow key={g.id}>
                  <TableCell>
                    <Link
                      to="/employee-groups/$id"
                      params={{ id: g.id }}
                      className="font-medium hover:underline"
                    >
                      {g.name}
                    </Link>
                  </TableCell>
                  <TableCell className="tabular-nums">{g.memberCount ?? 0}</TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">
                    {g.description || "—"}
                  </TableCell>
                  <TableActionsCell>
                    <TableActionLink
                      label="View"
                      to="/employee-groups/$id"
                      params={{ id: g.id }}
                    >
                      <IconEye className="size-3.5" />
                    </TableActionLink>
                    <TableActionButton
                      label="Delete"
                      variant="destructive"
                      onClick={async () => {
                        const ok = await confirm({
                          title: "Delete group?",
                          description: `Delete “${g.name}”? Members are unlinked; stand-ups that used this group block deletion.`,
                          confirmLabel: "Delete",
                          destructive: true,
                        })
                        if (!ok) return
                        try {
                          await api(`/employee-groups/${g.id}`, {
                            method: "DELETE",
                          })
                          await load()
                        } catch (e) {
                          alert(
                            e instanceof ApiError
                              ? e.message
                              : "Failed to delete group",
                          )
                        }
                      }}
                    >
                      <IconTrash className="size-3.5" />
                    </TableActionButton>
                  </TableActionsCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) {
            setName("")
            setDescription("")
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New group</DialogTitle>
          </DialogHeader>
          <form
            className="grid gap-3"
            onSubmit={async (e) => {
              e.preventDefault()
              try {
                const res = await api<Envelope<EmployeeGroup>>("/employee-groups", {
                  method: "POST",
                  body: {
                    name: name.trim(),
                    description: description.trim() || undefined,
                  },
                })
                setOpen(false)
                setName("")
                setDescription("")
                void navigate({
                  to: "/employee-groups/$id",
                  params: { id: res.data.id },
                })
              } catch (err) {
                alert(err instanceof ApiError ? err.message : "Failed to create group")
              }
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="group-name">Name</Label>
              <Input
                id="group-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="group-desc">Description</Label>
              <Textarea
                id="group-desc"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
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
      {dialog}
    </div>
  )
}
