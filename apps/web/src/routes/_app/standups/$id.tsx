import * as React from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Button } from "@workspace/ui/components/button"
import { Textarea } from "@workspace/ui/components/textarea"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Badge } from "@workspace/ui/components/badge"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/health-badge"
import { useConfirmDialog } from "@/components/confirm-dialog"
import { ErrorState, LoadingState } from "@/components/ui-states"
import { api, ApiError, type Envelope } from "@/lib/api"
import * as Y from "yjs"
import {
  connectStandupCollab,
  type CollabPeer,
} from "@/lib/standup-collab"
import type { AttendanceStatus, Project, Standup, StandupEntry } from "@/lib/types"

export const Route = createFileRoute("/_app/standups/$id")({
  component: StandupDetailPage,
})

type DraftAlloc = { projectId: string; percentage: number; isNonBillable?: boolean }

type EntryDraft = {
  attendanceStatus: AttendanceStatus
  notesMarkdown: string
  allocations: DraftAlloc[]
}

const ATTENDANCE: AttendanceStatus[] = [
  "present",
  "first_half_leave",
  "second_half_leave",
  "late",
  "absent",
]

function StandupDetailPage() {
  const { id } = Route.useParams()
  const { confirm, dialog } = useConfirmDialog()
  const [standup, setStandup] = React.useState<Standup | null>(null)
  const [projects, setProjects] = React.useState<Project[]>([])
  const [drafts, setDrafts] = React.useState<Record<string, EntryDraft>>({})
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [savingId, setSavingId] = React.useState<string | null>(null)
  const [selected, setSelected] = React.useState<string | null>(null)
  const [peers, setPeers] = React.useState<CollabPeer[]>([])
  const [collabConnected, setCollabConnected] = React.useState(false)
  const notesMapRef = React.useRef<Y.Map<string> | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [s, p] = await Promise.all([
        api<Envelope<Standup>>(`/standups/${id}`),
        api<Envelope<Project[]>>("/projects"),
      ])
      setStandup(s.data)
      setProjects(p.data)
      const next: Record<string, EntryDraft> = {}
      for (const entry of s.data.entries ?? []) {
        next[entry.id] = {
          attendanceStatus: entry.attendanceStatus,
          notesMarkdown: entry.notesMarkdown ?? "",
          allocations: (entry.allocations ?? []).map((a) => ({
            projectId: a.projectId,
            percentage: a.percentage,
            isNonBillable: a.isNonBillable,
          })),
        }
      }
      setDrafts(next)
      if (!selected && s.data.entries?.[0]) setSelected(s.data.entries[0].id)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load stand-up")
    } finally {
      setLoading(false)
    }
  }, [id, selected])

  React.useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only when id changes
  }, [id])

  React.useEffect(() => {
    const session = connectStandupCollab(id, (nextPeers) => {
      setPeers(nextPeers)
      setCollabConnected(true)
    })
    const notesMap = session.doc.getMap<string>("notes")
    notesMapRef.current = notesMap
    const observer = () => {
      setDrafts((prev) => {
        const next = { ...prev }
        for (const [entryId, text] of notesMap.entries()) {
          if (next[entryId]) {
            next[entryId] = { ...next[entryId], notesMarkdown: text }
          }
        }
        return next
      })
    }
    notesMap.observe(observer)
    return () => {
      notesMap.unobserve(observer)
      notesMapRef.current = null
      session.disconnect()
      setCollabConnected(false)
      setPeers([])
    }
  }, [id])

  if (loading) return <LoadingState />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (!standup) return null

  const entries = standup.entries ?? []
  const activeEntry = entries.find((e) => e.id === selected) ?? null
  const draft = activeEntry ? drafts[activeEntry.id] : null
  const readonly = standup.status === "completed"
  const allocSum = draft?.allocations.reduce((s, a) => s + (Number(a.percentage) || 0), 0) ?? 0

  const saveEntry = async (entry: StandupEntry) => {
    const d = drafts[entry.id]
    if (!d) return
    setSavingId(entry.id)
    try {
      const body =
        d.attendanceStatus === "absent"
          ? { attendanceStatus: d.attendanceStatus, notesMarkdown: "", allocations: [] }
          : {
              attendanceStatus: d.attendanceStatus,
              notesMarkdown: d.notesMarkdown,
              allocations: d.allocations.map((a) => ({
                projectId: a.projectId,
                percentage: Number(a.percentage),
                isNonBillable: a.isNonBillable,
              })),
            }
      await api(`/standups/${id}/entries/${entry.id}`, { method: "PATCH", body })
      await load()
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "Save failed")
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div>
      <PageHeader
        title={`Stand-up ${String(standup.date).slice(0, 10)}`}
        description="Edit attendance, notes, and project allocations"
        actions={
          <>
            <StatusBadge status={standup.status} />
            {standup.status === "completed" ? (
              <Button
                variant="outline"
                onClick={async () => {
                  await api(`/standups/${id}/reopen`, { method: "POST" })
                  await load()
                }}
              >
                Reopen
              </Button>
            ) : (
              <Button
                onClick={async () => {
                  const ok = await confirm({
                    title: "Complete stand-up?",
                    description: "Attendance records will be derived. Entries become read-only.",
                    confirmLabel: "Complete",
                  })
                  if (!ok) return
                  try {
                    await api(`/standups/${id}/complete`, { method: "POST" })
                    await load()
                  } catch (e) {
                    alert(e instanceof ApiError ? e.message : "Complete failed")
                  }
                }}
              >
                Complete
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={collabConnected ? "default" : "outline"}>
            {collabConnected ? "Live" : "Connecting…"}
          </Badge>
          <span className="text-muted-foreground">
            Realtime notes sync via Yjs. Entry saves still use HTTP PATCH.
          </span>
          {peers.length > 0 && (
            <span className="text-muted-foreground">
              Present: {peers.map((p) => p.userName).join(", ")}
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Employees</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 p-2">
            {entries.map((e) => (
              <button
                key={e.id}
                type="button"
                className={`flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm hover:bg-muted ${
                  selected === e.id ? "bg-muted font-medium" : ""
                }`}
                onClick={() => setSelected(e.id)}
              >
                <span className="truncate">{e.employee.name}</span>
                <Badge variant="outline" className="ml-2 capitalize">
                  {(drafts[e.id]?.attendanceStatus ?? e.attendanceStatus).replaceAll("_", " ")}
                </Badge>
              </button>
            ))}
          </CardContent>
        </Card>

        {activeEntry && draft ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{activeEntry.employee.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Attendance</Label>
                <Select
                  value={draft.attendanceStatus}
                  disabled={readonly}
                  onValueChange={(v) => {
                    const status = (v ?? "present") as AttendanceStatus
                    setDrafts((prev) => ({
                      ...prev,
                      [activeEntry.id]: {
                        ...prev[activeEntry.id]!,
                        attendanceStatus: status,
                        allocations: status === "absent" ? [] : prev[activeEntry.id]!.allocations,
                        notesMarkdown:
                          status === "absent" ? "" : prev[activeEntry.id]!.notesMarkdown,
                      },
                    }))
                  }}
                >
                  <SelectTrigger className="w-full max-w-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ATTENDANCE.map((a) => (
                      <SelectItem key={a} value={a}>
                        {a.replaceAll("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {draft.attendanceStatus !== "absent" ? (
                <>
                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea
                      disabled={readonly}
                      value={draft.notesMarkdown}
                      onChange={(e) => {
                        const value = e.target.value
                        notesMapRef.current?.set(activeEntry.id, value)
                        setDrafts((prev) => ({
                          ...prev,
                          [activeEntry.id]: {
                            ...prev[activeEntry.id]!,
                            notesMarkdown: value,
                          },
                        }))
                      }}
                      rows={4}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Allocations (must sum to 100%)</Label>
                      <span
                        className={`text-sm tabular-nums ${allocSum === 100 ? "text-muted-foreground" : "text-destructive"}`}
                      >
                        {allocSum}%
                      </span>
                    </div>
                    <div className="space-y-2">
                      {draft.allocations.map((alloc, idx) => (
                        <div key={idx} className="flex flex-wrap items-center gap-2">
                          <Select
                            disabled={readonly}
                            value={alloc.projectId || undefined}
                            onValueChange={(v) => {
                              setDrafts((prev) => {
                                const list = [...prev[activeEntry.id]!.allocations]
                                list[idx] = { ...list[idx]!, projectId: v ?? "" }
                                return {
                                  ...prev,
                                  [activeEntry.id]: { ...prev[activeEntry.id]!, allocations: list },
                                }
                              })
                            }}
                          >
                            <SelectTrigger className="min-w-48 flex-1">
                              <SelectValue placeholder="Project" />
                            </SelectTrigger>
                            <SelectContent>
                              {projects.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            disabled={readonly}
                            className="w-24"
                            value={alloc.percentage}
                            onChange={(e) => {
                              const percentage = Number(e.target.value)
                              setDrafts((prev) => {
                                const list = [...prev[activeEntry.id]!.allocations]
                                list[idx] = { ...list[idx]!, percentage }
                                return {
                                  ...prev,
                                  [activeEntry.id]: { ...prev[activeEntry.id]!, allocations: list },
                                }
                              })
                            }}
                          />
                          {!readonly ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setDrafts((prev) => ({
                                  ...prev,
                                  [activeEntry.id]: {
                                    ...prev[activeEntry.id]!,
                                    allocations: prev[activeEntry.id]!.allocations.filter(
                                      (_, i) => i !== idx,
                                    ),
                                  },
                                }))
                              }}
                            >
                              Remove
                            </Button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                    {!readonly ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setDrafts((prev) => ({
                            ...prev,
                            [activeEntry.id]: {
                              ...prev[activeEntry.id]!,
                              allocations: [
                                ...prev[activeEntry.id]!.allocations,
                                { projectId: "", percentage: 0 },
                              ],
                            },
                          }))
                        }}
                      >
                        Add project
                      </Button>
                    ) : null}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Absent — notes and allocations are cleared.
                </p>
              )}

              {!readonly ? (
                <Button
                  disabled={savingId === activeEntry.id}
                  onClick={() => void saveEntry(activeEntry)}
                >
                  {savingId === activeEntry.id ? "Saving…" : "Save entry"}
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ) : (
          <p className="text-sm text-muted-foreground">Select an employee entry.</p>
        )}
      </div>

      {(standup.overrides ?? []).length > 0 ? (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">Overrides</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <ul className="space-y-1">
              {standup.overrides!.map((o) => (
                <li key={o.id}>
                  {o.project?.name ?? o.projectId}: {o.reason}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {!readonly ? (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">Grant project override</CardTitle>
          </CardHeader>
          <CardContent>
            <OverrideForm
              projects={projects}
              onSubmit={async (projectId, reason) => {
                await api(`/standups/${id}/overrides`, {
                  method: "POST",
                  body: { projectId, reason },
                })
                await load()
              }}
            />
          </CardContent>
        </Card>
      ) : null}

      {dialog}
    </div>
  )
}

function OverrideForm({
  projects,
  onSubmit,
}: {
  projects: Project[]
  onSubmit: (projectId: string, reason: string) => Promise<void>
}) {
  const [projectId, setProjectId] = React.useState("")
  const [reason, setReason] = React.useState("")
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault()
        await onSubmit(projectId, reason.trim())
        setReason("")
      }}
    >
      <div className="space-y-1">
        <Label>Project</Label>
        <Select value={projectId || undefined} onValueChange={(v) => setProjectId(v ?? "")}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Closed project" />
          </SelectTrigger>
          <SelectContent>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="min-w-48 flex-1 space-y-1">
        <Label>Reason</Label>
        <Input required value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <Button type="submit" disabled={!projectId || !reason.trim()}>
        Grant
      </Button>
    </form>
  )
}
