import * as React from "react"
import { createFileRoute } from "@tanstack/react-router"
import {
  IconCalendar,
  IconClipboard,
  IconSearch,
  IconUsers,
} from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Card, CardContent } from "@workspace/ui/components/card"
import { Badge } from "@workspace/ui/components/badge"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/health-badge"
import { useConfirmDialog } from "@/components/confirm-dialog"
import { ErrorState, LoadingState } from "@/components/ui-states"
import {
  EmployeeStandupCard,
  isEntryComplete,
  isWorking,
  type EntryDraft,
} from "@/components/standup/employee-standup-card"
import { api, ApiError, type Envelope } from "@/lib/api"
import * as Y from "yjs"
import {
  connectStandupCollab,
  type CollabPeer,
} from "@/lib/standup-collab"
import type { Project, Standup, StandupEntry } from "@/lib/types"

export const Route = createFileRoute("/_app/stand-ups/$id")({
  component: StandupDetailPage,
})

const ATTENDANCE_LABEL: Record<string, string> = {
  present: "Present",
  late: "Late",
  first_half_leave: "1st half leave",
  second_half_leave: "2nd half leave",
  absent: "Absent",
}

function StandupDetailPage() {
  const { id } = Route.useParams()
  const { confirm, dialog } = useConfirmDialog()
  const [standup, setStandup] = React.useState<Standup | null>(null)
  const [projects, setProjects] = React.useState<Project[]>([])
  const [drafts, setDrafts] = React.useState<Record<string, EntryDraft>>({})
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [savingId, setSavingId] = React.useState<string | null>(null)
  const [query, setQuery] = React.useState("")
  const [copied, setCopied] = React.useState(false)
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
            locked: false,
          })),
        }
      }
      setDrafts(next)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load stand-up")
    } finally {
      setLoading(false)
    }
  }, [id])

  React.useEffect(() => {
    void load()
  }, [load])

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
  const readonly = standup.status === "completed"
  const q = query.trim().toLowerCase()
  const visible = entries.filter((e) => {
    if (!q) return true
    const hay = `${e.employee.name} ${e.employee.email}`.toLowerCase()
    return hay.includes(q)
  })

  const working = entries.filter((e) => {
    const d = drafts[e.id]
    return d ? isWorking(d.attendanceStatus) : e.attendanceStatus !== "absent"
  })
  const done = working.filter((e) => {
    const d = drafts[e.id]
    return d ? isEntryComplete(d) : false
  })
  const absentCount = entries.length - working.length

  const dateLabel = new Date(String(standup.date).slice(0, 10)).toLocaleDateString(
    undefined,
    { weekday: "long", day: "numeric", month: "long", year: "numeric" },
  )

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
              allocations: d.allocations
                .filter((a) => a.projectId)
                .map((a) => ({
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

  const copySummary = async () => {
    const lines = entries.map((e) => {
      const d = drafts[e.id]
      if (!d) return `## ${e.employee.name}`
      const status = ATTENDANCE_LABEL[d.attendanceStatus] ?? d.attendanceStatus
      if (!isWorking(d.attendanceStatus)) return `## ${e.employee.name} — ${status}`
      const split =
        d.allocations
          .map((a) => {
            const name = projects.find((p) => p.id === a.projectId)?.name ?? a.projectId
            return `${name} ${a.percentage}%`
          })
          .join(", ") || "no projects"
      return `## ${e.employee.name} — ${status}\n_${split}_\n${d.notesMarkdown.trim() || "(no notes)"}`
    })
    const text = `# Stand-up · ${dateLabel}\n\n${lines.join("\n\n")}`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      alert("Could not copy to clipboard")
    }
  }

  return (
    <div>
      <PageHeader
        title={`Stand-up · ${dateLabel}`}
        description="Attendance, notes, and project allocations"
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

      <div className="sticky top-4 z-20 mb-6 flex flex-wrap items-center gap-3 rounded-xl border bg-card/95 px-4 py-3 shadow-sm backdrop-blur">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <IconCalendar className="size-3.5" />
            {dateLabel}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant={collabConnected ? "default" : "outline"}>
              {collabConnected ? "Live" : "Connecting…"}
            </Badge>
            {peers.length > 0 ? (
              <span>Present: {peers.map((p) => p.userName).join(", ")}</span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
          <IconUsers className="size-3.5" />
          <span>
            {done.length}/{working.length} recorded
          </span>
          <span className="text-border">|</span>
          <span>{absentCount} absent</span>
        </div>

        <div className="relative w-full sm:w-52">
          <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find someone…"
            className="h-9 pl-8 text-sm"
          />
        </div>

        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => void copySummary()}
        >
          <IconClipboard className="size-3.5" />
          {copied ? "Copied" : "Copy summary"}
        </Button>
      </div>

      <div className="space-y-4">
        {visible.map((entry) => {
          const draft = drafts[entry.id]
          if (!draft) return null
          return (
            <EmployeeStandupCard
              key={entry.id}
              entry={entry}
              draft={draft}
              projects={projects}
              readonly={readonly}
              saving={savingId === entry.id}
              onChange={(next) =>
                setDrafts((prev) => ({ ...prev, [entry.id]: next }))
              }
              onNotesChange={(notes) => {
                notesMapRef.current?.set(entry.id, notes)
                setDrafts((prev) => ({
                  ...prev,
                  [entry.id]: { ...prev[entry.id]!, notesMarkdown: notes },
                }))
              }}
              onSave={() => void saveEntry(entry)}
            />
          )
        })}
        {visible.length === 0 ? (
          <Card>
            <CardContent className="px-4 py-10 text-center text-sm text-muted-foreground">
              {query.trim()
                ? `No one matches “${query.trim()}”.`
                : "No employees in this stand-up."}
            </CardContent>
          </Card>
        ) : null}
      </div>

      {dialog}
    </div>
  )
}
