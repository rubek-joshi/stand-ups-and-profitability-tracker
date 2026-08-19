import * as React from "react"
import { Link, createFileRoute } from "@tanstack/react-router"
import {
  IconPlayerPlay,
  IconPlayerPause,
  IconSearch,
} from "@tabler/icons-react"
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
import { PaginationBar } from "@/components/pagination-bar"
import { StatusBadge } from "@/components/health-badge"
import { useConfirmDialog } from "@/components/confirm-dialog"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui-states"
import {
  TableActionButton,
  TableActionsCell,
  TableActionsHead,
} from "@/components/table-row-actions"
import { api, ApiError, type PaginatedEnvelope } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { GeneratePasswordButton, PasswordInput } from "@/components/password-input"
import { buildListQuery, parseListSearch, totalPagesFor } from "@/lib/list-query"
import { formatLastLogin, ROLE_ITEMS, ROLE_LABELS, roleLabel } from "@/lib/roles"
import type { SystemUser, UserRole } from "@/lib/types"

export const Route = createFileRoute("/_app/users/")({
  validateSearch: (search: Record<string, unknown>) => parseListSearch(search),
  component: UsersPage,
})

function UsersPage() {
  const { user: currentUser } = useAuth()
  const navigate = Route.useNavigate()
  const { q, page, pageSize } = Route.useSearch()
  const [items, setItems] = React.useState<SystemUser[]>([])
  const [total, setTotal] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [searchInput, setSearchInput] = React.useState(q ?? "")
  const [formError, setFormError] = React.useState<string | null>(null)
  const [createForm, setCreateForm] = React.useState({
    name: "",
    email: "",
    password: "",
    role: "manager" as UserRole,
    mustChangePassword: true,
  })
  const { confirm, dialog } = useConfirmDialog()

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
      const res = await api<PaginatedEnvelope<SystemUser[]>>(`/users?${qs}`)
      setItems(res.data)
      setTotal(res.meta?.total ?? res.data.length)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load users")
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
        title="Users"
        description="Accounts that can sign in to Tracker"
        actions={
          <Button
            onClick={() => {
              setFormError(null)
              setCreateForm({
                name: "",
                email: "",
                password: "",
                role: "manager",
                mustChangePassword: true,
              })
              setCreateOpen(true)
            }}
          >
            New user
          </Button>
        }
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
        <EmptyState message={q ? "No users match your search" : "No users"} />
      ) : null}
      {items.length > 0 ? (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last login</TableHead>
                  <TableActionsHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((u) => {
                  const isSelf = currentUser?.id === u.id
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">
                        <Link
                          to="/users/$id"
                          params={{ id: u.id }}
                          className="hover:underline"
                        >
                          {u.name}
                        </Link>
                        {isSelf ? (
                          <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                        ) : null}
                      </TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell>{roleLabel(u.role)}</TableCell>
                      <TableCell>
                        <StatusBadge status={u.isActive ? "active" : "inactive"} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatLastLogin(u.lastLoginAt)}
                      </TableCell>
                      <TableActionsCell>
                        {u.isActive ? (
                          <TableActionButton
                            label="Deactivate"
                            variant="destructive"
                            disabled={isSelf}
                            onClick={async () => {
                              if (isSelf) return
                              const ok = await confirm({
                                title: "Deactivate user?",
                                description: `"${u.name}" will no longer be able to sign in.`,
                                confirmLabel: "Deactivate",
                                destructive: true,
                              })
                              if (!ok) return
                              try {
                                await api(`/users/${u.id}`, {
                                  method: "PATCH",
                                  body: { isActive: false },
                                })
                                await load()
                              } catch (err) {
                                alert(
                                  err instanceof ApiError
                                    ? err.message
                                    : "Failed to deactivate user",
                                )
                              }
                            }}
                          >
                            <IconPlayerPause className="size-3.5" />
                          </TableActionButton>
                        ) : (
                          <TableActionButton
                            label="Reactivate"
                            disabled={isSelf}
                            onClick={async () => {
                              try {
                                await api(`/users/${u.id}`, {
                                  method: "PATCH",
                                  body: { isActive: true },
                                })
                                await load()
                              } catch (err) {
                                alert(
                                  err instanceof ApiError
                                    ? err.message
                                    : "Failed to reactivate user",
                                )
                              }
                            }}
                          >
                            <IconPlayerPlay className="size-3.5" />
                          </TableActionButton>
                        )}
                      </TableActionsCell>
                    </TableRow>
                  )
                })}
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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create user</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault()
              setFormError(null)
              try {
                await api("/users", {
                  method: "POST",
                  body: {
                    name: createForm.name.trim(),
                    email: createForm.email.trim(),
                    password: createForm.password,
                    role: createForm.role,
                    mustChangePassword: createForm.mustChangePassword,
                  },
                })
                setCreateOpen(false)
                await load()
              } catch (err) {
                setFormError(err instanceof ApiError ? err.message : "Failed to create user")
              }
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="user-name">Name</Label>
              <Input
                id="user-name"
                required
                value={createForm.name}
                onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-email">Email</Label>
              <Input
                id="user-email"
                type="email"
                required
                value={createForm.email}
                onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="user-password">Password</Label>
              <div className="flex items-center gap-2">
                <PasswordInput
                  id="user-password"
                  className="min-w-0 flex-1"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={createForm.password}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, password: e.target.value }))
                  }
                />
                <GeneratePasswordButton
                  onGenerate={(password) =>
                    setCreateForm((f) => ({ ...f, password }))
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select
                value={createForm.role}
                onValueChange={(v) =>
                  setCreateForm((f) => ({ ...f, role: (v as UserRole) ?? "manager" }))
                }
                items={ROLE_ITEMS}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ROLE_LABELS) as UserRole[]).map((role) => (
                    <SelectItem key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={createForm.mustChangePassword}
                onCheckedChange={(value) =>
                  setCreateForm((f) => ({ ...f, mustChangePassword: Boolean(value) }))
                }
              />
              Require password change on first login
            </label>
            {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
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
