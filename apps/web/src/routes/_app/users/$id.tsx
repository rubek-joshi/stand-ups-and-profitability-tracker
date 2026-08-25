import * as React from "react"
import { Link, createFileRoute } from "@tanstack/react-router"
import {
  IconDotsVertical,
  IconExternalLink,
  IconKey,
  IconPencil,
  IconPlayerPlay,
  IconUserOff,
} from "@tabler/icons-react"
import { Button, buttonVariants } from "@workspace/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/health-badge"
import { MailLink } from "@/components/contact-link"
import { GeneratePasswordButton, PasswordInput } from "@/components/password-input"
import { EntityLink } from "@/components/resource-link"
import { useConfirmDialog } from "@/components/confirm-dialog"
import { ErrorState, LoadingState } from "@/components/ui-states"
import {
  TableActionLink,
  TableActionsCell,
  TableActionsHead,
} from "@/components/table-row-actions"
import { api, ApiError, type Envelope, type PaginatedEnvelope } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { DEFAULT_LIST_SEARCH } from "@/lib/list-query"
import { formatDateTime, formatLastLogin, ROLE_ITEMS, ROLE_LABELS, roleLabel } from "@/lib/roles"
import type { AuditLog, SystemUser, UserRole } from "@/lib/types"

export const Route = createFileRoute("/_app/users/$id")({
  component: UserDetailPage,
})

const ENTITY_ROUTES: Record<string, string> = {
  Client: "/clients/$id",
  Project: "/projects/$id",
  Employee: "/employees/$id",
  CoreMember: "/core-members/$id",
  Standup: "/stand-ups/$id",
  User: "/users/$id",
}

function standupScopeLabel(user: SystemUser): string {
  if (user.standupScopePreference === "group") {
    const groupName = user.standupPreferredGroup?.name?.trim()
    return groupName ? `Group · ${groupName}` : "A specific group"
  }
  if (user.standupScopePreference === "everyone") return "Everyone"
  return "Ask every time"
}

function UserDetailPage() {
  const { id } = Route.useParams()
  const { user: currentUser } = useAuth()
  const { confirm, dialog } = useConfirmDialog()
  const [user, setUser] = React.useState<SystemUser | null>(null)
  const [logs, setLogs] = React.useState<AuditLog[]>([])
  const [auditTotal, setAuditTotal] = React.useState(0)
  const [auditError, setAuditError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [editing, setEditing] = React.useState(false)
  const [passwordOpen, setPasswordOpen] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [editForm, setEditForm] = React.useState({
    name: "",
    email: "",
    role: "manager" as UserRole,
  })
  const [passwordForm, setPasswordForm] = React.useState({
    password: "",
    mustChangePassword: true,
  })

  const isSelf = currentUser?.id === id
  const isSuperAdmin = currentUser?.role === "super_admin"
  const canViewAudit = isSuperAdmin || currentUser?.role === "admin"

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api<Envelope<SystemUser>>(`/users/${id}`)
      setUser(res.data)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load user")
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [id])

  const loadAudit = React.useCallback(async () => {
    if (!canViewAudit) {
      setLogs([])
      setAuditTotal(0)
      setAuditError(null)
      return
    }
    try {
      const res = await api<PaginatedEnvelope<AuditLog[]>>(
        `/audit?relatedUserId=${encodeURIComponent(id)}&page=1&pageSize=8`,
      )
      setLogs(res.data)
      setAuditTotal(res.meta?.total ?? res.data.length)
      setAuditError(null)
    } catch (e) {
      setLogs([])
      setAuditTotal(0)
      setAuditError(
        e instanceof ApiError && e.status === 403
          ? null
          : e instanceof ApiError
            ? e.message
            : "Failed to load audit activity",
      )
    }
  }, [id, canViewAudit])

  React.useEffect(() => {
    void load()
    setEditing(false)
  }, [load])

  React.useEffect(() => {
    void loadAudit()
  }, [loadAudit])

  if (loading) return <LoadingState />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (!user) return null

  return (
    <div>
      <PageHeader
        title={user.name}
        description={user.email}
        breadcrumbs={[
          { label: "Users", to: "/users", search: DEFAULT_LIST_SEARCH },
          { label: user.name },
        ]}
        status={
          <StatusBadge status={user.isActive ? "active" : "inactive"} />
        }
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="User actions"
                />
              }
            >
              <IconDotsVertical />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-44">
              <DropdownMenuGroup>
                {isSelf ? (
                  <Tooltip>
                    <TooltipTrigger
                      render={<div className="w-full cursor-not-allowed" />}
                    >
                      <DropdownMenuItem disabled>
                        <IconKey />
                        Change password
                      </DropdownMenuItem>
                    </TooltipTrigger>
                    <TooltipContent>
                      You can change your password from Profile instead.
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <DropdownMenuItem
                    onClick={() => {
                      setFormError(null)
                      setPasswordForm({ password: "", mustChangePassword: true })
                      setPasswordOpen(true)
                    }}
                  >
                    <IconKey />
                    Change password
                  </DropdownMenuItem>
                )}
                {user.isActive ? (
                  isSelf ? (
                    <Tooltip>
                      <TooltipTrigger
                        render={<div className="w-full cursor-not-allowed" />}
                      >
                        <DropdownMenuItem disabled>
                          <IconUserOff />
                          Deactivate
                        </DropdownMenuItem>
                      </TooltipTrigger>
                      <TooltipContent>
                        You cannot deactivate your own account.
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <DropdownMenuItem
                      onClick={async () => {
                        const ok = await confirm({
                          title: "Deactivate user?",
                          description: `"${user.name}" will no longer be able to sign in.`,
                          confirmLabel: "Deactivate",
                          destructive: true,
                        })
                        if (!ok) return
                        try {
                          await api(`/users/${id}`, {
                            method: "PATCH",
                            body: { isActive: false },
                          })
                          await load()
                          await loadAudit()
                        } catch (err) {
                          alert(
                            err instanceof ApiError
                              ? err.message
                              : "Failed to deactivate user",
                          )
                        }
                      }}
                    >
                      <IconUserOff />
                      Deactivate
                    </DropdownMenuItem>
                  )
                ) : isSelf ? (
                  <Tooltip>
                    <TooltipTrigger
                      render={<div className="w-full cursor-not-allowed" />}
                    >
                      <DropdownMenuItem disabled>
                        <IconPlayerPlay />
                        Reactivate
                      </DropdownMenuItem>
                    </TooltipTrigger>
                    <TooltipContent>
                      You cannot reactivate your own account.
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <DropdownMenuItem
                    onClick={async () => {
                      try {
                        await api(`/users/${id}`, {
                          method: "PATCH",
                          body: { isActive: true },
                        })
                        await load()
                        await loadAudit()
                      } catch (err) {
                        alert(
                          err instanceof ApiError
                            ? err.message
                            : "Failed to reactivate user",
                        )
                      }
                    }}
                  >
                    <IconPlayerPlay />
                    Reactivate
                  </DropdownMenuItem>
                )}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        {canViewAudit ? (
          <Card className="min-w-0">
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
              <CardTitle className="text-base">Recent activity</CardTitle>
              <Link
                to="/audit"
                search={{
                  page: 1,
                  pageSize: 25,
                  action: undefined,
                  actorId: undefined,
                  relatedUserId: id,
                }}
                className={buttonVariants({
                  variant: "ghost",
                  size: "sm",
                  className: "h-7 shrink-0 px-2 text-xs",
                })}
              >
                View all
              </Link>
            </CardHeader>
            <CardContent>
              {auditError ? (
                <p className="text-sm text-destructive">{auditError}</p>
              ) : logs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No audit activity for this user.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>When</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Actor</TableHead>
                        <TableHead>Entity</TableHead>
                        <TableActionsHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.map((log) => {
                        const type = log.targetType ?? log.entityType ?? ""
                        const entityId = log.targetId ?? log.entityId ?? ""
                        const entityRoute = entityId ? ENTITY_ROUTES[type] : undefined
                        const label = type && entityId ? `${type} · ${entityId.slice(0, 8)}…` : "—"
                        return (
                          <TableRow key={log.id}>
                            <TableCell className="whitespace-nowrap text-sm">
                              {formatDateTime(log.createdAt)}
                            </TableCell>
                            <TableCell className="font-mono text-xs">{log.action}</TableCell>
                            <TableCell className="text-sm">
                              {log.actor?.name ?? log.actor?.email ?? "—"}
                            </TableCell>
                            <TableCell className="text-sm">
                              {entityId ? (
                                <EntityLink type={type} id={entityId}>
                                  {label}
                                </EntityLink>
                              ) : (
                                label
                              )}
                            </TableCell>
                            <TableActionsCell>
                              {entityRoute ? (
                                <TableActionLink
                                  label="Open entity"
                                  to={entityRoute}
                                  params={{ id: entityId }}
                                >
                                  <IconExternalLink className="size-3.5" />
                                </TableActionLink>
                              ) : null}
                            </TableActionsCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                  {auditTotal > logs.length ? (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Showing {logs.length} of {auditTotal} entries.
                    </p>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="hidden min-w-0 lg:block" />
        )}

        <aside className="lg:sticky lg:top-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">User details</CardTitle>
              {!editing ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Edit details"
                  onClick={() => {
                    setFormError(null)
                    setEditForm({
                      name: user.name,
                      email: user.email,
                      role: (user.role as UserRole) || "manager",
                    })
                    setEditing(true)
                  }}
                >
                  <IconPencil className="size-3.5" />
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className={editing ? undefined : "space-y-4 text-sm"}>
              {editing ? (
                <form
                  className="flex flex-col gap-3"
                  onSubmit={async (e) => {
                    e.preventDefault()
                    setFormError(null)
                    setSaving(true)
                    try {
                      await api(`/users/${id}`, {
                        method: "PATCH",
                        body: {
                          name: editForm.name.trim(),
                          email: editForm.email.trim(),
                          ...(isSelf ? {} : { role: editForm.role }),
                        },
                      })
                      setEditing(false)
                      await load()
                      await loadAudit()
                    } catch (err) {
                      setFormError(
                        err instanceof ApiError ? err.message : "Failed to update user",
                      )
                    } finally {
                      setSaving(false)
                    }
                  }}
                >
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="edit-user-name">Name</Label>
                    <Input
                      id="edit-user-name"
                      required
                      value={editForm.name}
                      onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="edit-user-email">Email</Label>
                    <Input
                      id="edit-user-email"
                      type="email"
                      required
                      value={editForm.email}
                      onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>Role</Label>
                    <Select
                      value={editForm.role}
                      onValueChange={(v) =>
                        setEditForm((f) => ({ ...f, role: (v as UserRole) ?? "manager" }))
                      }
                      items={ROLE_ITEMS}
                      disabled={isSelf}
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
                    {isSelf ? (
                      <p className="text-xs text-muted-foreground">
                        You cannot change your own role.
                      </p>
                    ) : null}
                  </div>
                  {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={saving}>
                      {saving ? "Saving…" : "Save"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={saving}
                      onClick={() => {
                        setFormError(null)
                        setEditing(false)
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <>
                  <Detail
                    label="Name"
                    value={isSelf ? `${user.name} (you)` : user.name}
                  />
                  <Detail
                    label="Email"
                    value={<MailLink value={user.email} withCopy />}
                  />
                  <Detail label="Role" value={roleLabel(user.role)} />
                  <Detail
                    label="Must change password"
                    value={user.mustChangePassword ? "Yes" : "No"}
                  />
                  <Detail
                    label="Last login"
                    value={formatLastLogin(user.lastLoginAt)}
                  />
                  <Detail
                    label="Stand-up scope"
                    value={standupScopeLabel(user)}
                  />
                  <Detail
                    label="Created"
                    value={formatDateTime(user.createdAt)}
                  />
                  <Detail
                    label="Updated"
                    value={formatDateTime(user.updatedAt)}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>

      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <DialogContent className="max-h-[min(90dvh,36rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Change password</DialogTitle>
          </DialogHeader>
          <form
            className="flex flex-col gap-3"
            onSubmit={async (e) => {
              e.preventDefault()
              setFormError(null)
              try {
                await api(`/users/${id}/password`, {
                  method: "POST",
                  body: {
                    password: passwordForm.password,
                    mustChangePassword: passwordForm.mustChangePassword,
                  },
                })
                setPasswordOpen(false)
                await load()
                await loadAudit()
              } catch (err) {
                setFormError(
                  err instanceof ApiError ? err.message : "Failed to change password",
                )
              }
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="set-user-password">New password</Label>
              <div className="flex items-center gap-2">
                <PasswordInput
                  id="set-user-password"
                  className="min-w-0 flex-1"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={passwordForm.password}
                  onChange={(e) =>
                    setPasswordForm((f) => ({ ...f, password: e.target.value }))
                  }
                />
                <GeneratePasswordButton
                  onGenerate={(password) => setPasswordForm((f) => ({ ...f, password }))}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={passwordForm.mustChangePassword}
                onCheckedChange={(value) =>
                  setPasswordForm((f) => ({ ...f, mustChangePassword: Boolean(value) }))
                }
              />
              Require password change on next login
            </label>
            {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPasswordOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Update password</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {dialog}
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
