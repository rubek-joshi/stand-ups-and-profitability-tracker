import * as React from "react"
import { createFileRoute } from "@tanstack/react-router"
import { IconDeviceDesktop, IconMoon, IconSun } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { PageHeader } from "@/components/page-header"
import { ErrorState, LoadingState } from "@/components/ui-states"
import { api, ApiError, type PaginatedEnvelope } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { useTheme } from "@/lib/theme"
import type { EmployeeGroup, StandupScopePreference } from "@/lib/types"

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
    hint: "Always include all active employees without asking.",
  },
  {
    value: "group",
    label: "A specific group",
    hint: "Always include only members of the selected group.",
  },
]

function ProfilePage() {
  const { user, refreshUser } = useAuth()
  const { theme, setTheme } = useTheme()
  const [groups, setGroups] = React.useState<EmployeeGroup[]>([])
  const [preference, setPreference] = React.useState<StandupScopePreference>("ask")
  const [groupId, setGroupId] = React.useState("")
  const [loadingGroups, setLoadingGroups] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [savedMsg, setSavedMsg] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!user) return
    setPreference(user.standupScopePreference ?? "ask")
    setGroupId(user.standupPreferredGroupId ?? "")
  }, [user])

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoadingGroups(true)
      try {
        const res = await api<PaginatedEnvelope<EmployeeGroup[]>>(
          "/employee-groups",
        )
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

      <div className="grid max-w-2xl gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Account</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1 text-sm">
            <p>
              <span className="text-muted-foreground">Name:</span> {user.name}
            </p>
            <p>
              <span className="text-muted-foreground">Email:</span> {user.email}
            </p>
            {user.role ? (
              <p>
                <span className="text-muted-foreground">Role:</span> {user.role}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Appearance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-3">
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
            <CardTitle className="text-base">Stand-up participants</CardTitle>
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
                        : "Failed to save preference",
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
                      items={Object.fromEntries(groups.map((g) => [g.id, g.name]))}
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

                <div className="flex flex-wrap items-center gap-3">
                  <Button type="submit" disabled={saving}>
                    {saving ? "Saving…" : "Save preference"}
                  </Button>
                  {preference !== "ask" ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={saving}
                      onClick={async () => {
                        setSaving(true)
                        setSavedMsg(null)
                        try {
                          await api("/auth/me", {
                            method: "PATCH",
                            body: {
                              standupScopePreference: "ask",
                              standupPreferredGroupId: null,
                            },
                          })
                          setPreference("ask")
                          setGroupId("")
                          await refreshUser()
                          setSavedMsg("Reset to ask every time.")
                        } catch (err) {
                          alert(
                            err instanceof ApiError
                              ? err.message
                              : "Failed to reset",
                          )
                        } finally {
                          setSaving(false)
                        }
                      }}
                    >
                      Reset to ask every time
                    </Button>
                  ) : null}
                </div>
                {savedMsg ? (
                  <p className="text-sm text-muted-foreground">{savedMsg}</p>
                ) : null}
              </form>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
