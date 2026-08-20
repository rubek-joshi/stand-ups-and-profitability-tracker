import * as React from "react"
import { createFileRoute } from "@tanstack/react-router"
import {
  IconDeviceDesktop,
  IconMoon,
  IconPencil,
  IconSun,
} from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { PageHeader } from "@/components/page-header"
import { ChangePasswordDialog } from "@/components/change-password-dialog"
import { PasskeysCard } from "@/components/passkeys-card"
import { ErrorState, LoadingState } from "@/components/ui-states"
import { api, ApiError, type PaginatedEnvelope } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { useTheme } from "@/lib/theme"
import type {
  EmployeeGroup,
  StandupLayoutPreference,
  StandupScopePreference,
} from "@/lib/types"

export const Route = createFileRoute("/_app/profile")({
  component: ProfilePage,
})

const PREFERENCE_OPTIONS: Array<{
  value: StandupScopePreference
  label: string
  hint: string
}> = [
  {
    value: "ask",
    label: "Ask every time",
    hint: "Show the everyone / group prompt when creating a stand-up (default).",
  },
  {
    value: "everyone",
    label: "Everyone",
    hint: "Show all employees when opening a stand-up.",
  },
  {
    value: "group",
    label: "A specific group",
    hint: "Show only members of your selected group by default; others stay in the stand-up.",
  },
]

function ProfilePage() {
  const { user, refreshUser } = useAuth()
  const { theme, setTheme } = useTheme()
  const [name, setName] = React.useState("")
  const [editingName, setEditingName] = React.useState(false)
  const [groups, setGroups] = React.useState<EmployeeGroup[]>([])
  const [preference, setPreference] =
    React.useState<StandupScopePreference>("ask")
  const [layoutPreference, setLayoutPreference] =
    React.useState<StandupLayoutPreference>("card")
  const [groupId, setGroupId] = React.useState("")
  const [loadingGroups, setLoadingGroups] = React.useState(true)
  const [savingName, setSavingName] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [savedMsg, setSavedMsg] = React.useState<string | null>(null)
  const [passwordOpen, setPasswordOpen] = React.useState(false)

  React.useEffect(() => {
    if (!user) return
    if (!editingName) setName(user.name)
    setPreference(user.standupScopePreference ?? "ask")
    setLayoutPreference(user.standupLayoutPreference ?? "card")
    setGroupId(user.standupPreferredGroupId ?? "")
  }, [user, editingName])

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoadingGroups(true)
      try {
        const res =
          await api<PaginatedEnvelope<EmployeeGroup[]>>("/employee-groups")
        if (!cancelled) setGroups(res.data)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "Failed to load groups")
        }
      } finally {
        if (!cancelled) setLoadingGroups(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (!user) return <LoadingState label="Loading profile…" />

  return (
    <div>
      <PageHeader
        title="Profile"
        description="Your account, appearance, and stand-up preferences"
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="grid min-w-0 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Account</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">Name:</span>
                {editingName ? (
                  <form
                    className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
                    onSubmit={async (e) => {
                      e.preventDefault()
                      const trimmed = name.trim()
                      if (!trimmed) {
                        alert("Name is required.")
                        return
                      }
                      if (trimmed === user.name) {
                        setEditingName(false)
                        return
                      }
                      setSavingName(true)
                      try {
                        await api("/auth/me", {
                          method: "PATCH",
                          body: { name: trimmed },
                        })
                        await refreshUser()
                        setEditingName(false)
                      } catch (err) {
                        alert(
                          err instanceof ApiError
                            ? err.message
                            : "Failed to update name"
                        )
                      } finally {
                        setSavingName(false)
                      }
                    }}
                  >
                    <Input
                      id="profile-name"
                      autoFocus
                      required
                      maxLength={200}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          setName(user.name)
                          setEditingName(false)
                        }
                      }}
                      className="h-8 max-w-xs"
                    />
                    <Button
                      type="submit"
                      size="sm"
                      disabled={savingName || name.trim() === user.name}
                    >
                      {savingName ? "Saving…" : "Save"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={savingName}
                      onClick={() => {
                        setName(user.name)
                        setEditingName(false)
                      }}
                    >
                      Cancel
                    </Button>
                  </form>
                ) : (
                  <>
                    <span className="font-medium">{user.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Edit name"
                      onClick={() => {
                        setName(user.name)
                        setEditingName(true)
                      }}
                    >
                      <IconPencil className="size-3.5" />
                    </Button>
                  </>
                )}
              </div>
              <p>
                <span className="text-muted-foreground">Email:</span>{" "}
                {user.email}
              </p>
              {user.role ? (
                <p>
                  <span className="text-muted-foreground">Role:</span>{" "}
                  {user.role}
                </p>
              ) : null}
              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPasswordOpen(true)}
                >
                  Change password
                </Button>
              </div>
            </CardContent>
          </Card>

          <PasskeysCard />
        </div>

        <aside className="flex flex-col gap-6 lg:sticky lg:top-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Appearance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2">
                <button
                  type="button"
                  onClick={() => setTheme("system")}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors ${
                    theme === "system"
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  <IconDeviceDesktop className="size-5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">System</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Match your device setting
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setTheme("light")}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors ${
                    theme === "light"
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  <IconSun className="size-5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Light</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Bright background for daytime use
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setTheme("dark")}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors ${
                    theme === "dark"
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  <IconMoon className="size-5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Dark</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Dimmer UI for low-light environments
                    </p>
                  </div>
                </button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Stand-up view</CardTitle>
            </CardHeader>
            <CardContent>
              {error ? <ErrorState message={error} /> : null}
              {loadingGroups ? <LoadingState /> : null}
              {!loadingGroups ? (
                <form
                  className="grid gap-4"
                  onSubmit={async (e) => {
                    e.preventDefault()
                    if (preference === "group" && !groupId) {
                      alert("Pick a group to remember.")
                      return
                    }
                    setSaving(true)
                    setSavedMsg(null)
                    try {
                      await api("/auth/me", {
                        method: "PATCH",
                        body: {
                          standupScopePreference: preference,
                          standupLayoutPreference: layoutPreference,
                          standupPreferredGroupId:
                            preference === "group" ? groupId : null,
                        },
                      })
                      await refreshUser()
                      setSavedMsg("Preference saved.")
                    } catch (err) {
                      alert(
                        err instanceof ApiError
                          ? err.message
                          : "Failed to save preference"
                      )
                    } finally {
                      setSaving(false)
                    }
                  }}
                >
                  <div className="grid gap-2">
                    {PREFERENCE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setPreference(opt.value)}
                        className={`rounded-lg border px-3 py-3 text-left transition-colors ${
                          preference === opt.value
                            ? "border-primary bg-primary/10"
                            : "border-border hover:bg-muted"
                        }`}
                      >
                        <p className="text-sm font-medium">{opt.label}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {opt.hint}
                        </p>
                      </button>
                    ))}
                  </div>

                  {preference === "group" ? (
                    <div className="grid gap-2">
                      <Label>Preferred group</Label>
                      <Select
                        value={groupId || null}
                        onValueChange={(v) => setGroupId(v ?? "")}
                        items={Object.fromEntries(
                          groups.map((g) => [g.id, g.name])
                        )}
                        disabled={groups.length === 0}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue
                            placeholder={
                              groups.length === 0
                                ? "No groups available"
                                : "Choose a group"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {groups.map((g) => (
                            <SelectItem key={g.id} value={g.id}>
                              {g.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}

                  <div className="grid gap-2">
                    <Label>Default layout</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {(
                        [
                          { id: "card" as const, label: "Card view" },
                          { id: "table" as const, label: "Table view" },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setLayoutPreference(opt.id)}
                          className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                            layoutPreference === opt.id
                              ? "border-primary bg-primary/10 font-medium"
                              : "border-border hover:bg-muted"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <Button type="submit" disabled={saving}>
                      {saving ? "Saving…" : "Save preference"}
                    </Button>
                  </div>
                  {savedMsg ? (
                    <p className="text-sm text-muted-foreground">{savedMsg}</p>
                  ) : null}
                </form>
              ) : null}
            </CardContent>
          </Card>
        </aside>
      </div>
      <ChangePasswordDialog
        open={passwordOpen}
        onOpenChange={setPasswordOpen}
      />
    </div>
  )
}
