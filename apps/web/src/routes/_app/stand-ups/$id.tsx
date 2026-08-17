import * as React from "react"
import { createFileRoute, useBlocker } from "@tanstack/react-router"
import {
  IconArrowUp,
  IconCalendar,
  IconClipboard,
  IconDeviceFloppy,
  IconSearch,
  IconUsers,
} from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Card, CardContent } from "@workspace/ui/components/card"
import { Badge } from "@workspace/ui/components/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
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
import type { Project, Standup } from "@/lib/types"

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

function draftsFromStandup(standup: Standup): Record<string, EntryDraft> {
  const next: Record<string, EntryDraft> = {}
  for (const entry of standup.entries ?? []) {
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
  return next
}

function serializeDrafts(drafts: Record<string, EntryDraft>): string {
  const ids = Object.keys(drafts).sort()
  return JSON.stringify(
    ids.map((id) => {
      const d = drafts[id]!
      return {
        id,
        attendanceStatus: d.attendanceStatus,
        notesMarkdown: d.notesMarkdown,
        allocations: d.allocations
          .filter((a) => a.projectId)
          .map((a) => ({
            projectId: a.projectId,
            percentage: Number(a.percentage),
            isNonBillable: Boolean(a.isNonBillable),
          })),
      }
    }),
  )
}

function buildEntriesPayload(
  entries: Standup["entries"],
  drafts: Record<string, EntryDraft>,
) {
  return (entries ?? []).flatMap((entry) => {
    const d = drafts[entry.id]
    if (!d) return []
    if (d.attendanceStatus === "absent") {
      return [
        {
          id: entry.id,
          attendanceStatus: "absent" as const,
          notesMarkdown: "",
          allocations: [],
        },
      ]
    }
    return [
      {
        id: entry.id,
        attendanceStatus: d.attendanceStatus,
        notesMarkdown: d.notesMarkdown,
        allocations: d.allocations
          .filter((a) => a.projectId)
          .map((a) => ({
            projectId: a.projectId,
            percentage: Number(a.percentage),
            isNonBillable: a.isNonBillable,
          })),
      },
    ]
  })
}

function StandupDetailPage() {
  const { id } = Route.useParams()
  const { confirm, dialog } = useConfirmDialog()
  const [standup, setStandup] = React.useState<Standup | null>(null)
  const [projects, setProjects] = React.useState<Project[]>([])
  const [drafts, setDrafts] = React.useState<Record<string, EntryDraft>>({})
  const [baseline, setBaseline] = React.useState("")
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [copied, setCopied] = React.useState(false)
  const [peers, setPeers] = React.useState<CollabPeer[]>([])
  const [collabConnected, setCollabConnected] = React.useState(false)
  const [leaveBusy, setLeaveBusy] = React.useState(false)
  const [showScrollTop, setShowScrollTop] = React.useState(false)
  const notesMapRef = React.useRef<Y.Map<string> | null>(null)
  const draftsRef = React.useRef(drafts)
  draftsRef.current = drafts

  const readonly = standup?.status === "completed"
  const isDirty =
    Boolean(standup) && !readonly && baseline !== "" && serializeDrafts(drafts) !== baseline

  const blocker = useBlocker({
    shouldBlockFn: () => isDirty,
    withResolver: true,
    enableBeforeUnload: isDirty,
  })

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
      const next = draftsFromStandup(s.data)
      setDrafts(next)
      setBaseline(serializeDrafts(next))
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
    const onScroll = () => {
      setShowScrollTop(window.scrollY > 320)
    }
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

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

  const saveAll = React.useCallback(async () => {
    if (!standup || readonly) return false
    const currentDrafts = draftsRef.current
    const entries = buildEntriesPayload(standup.entries, currentDrafts)
    if (entries.length === 0) return true
    setSaving(true)
    try {
      const res = await api<Envelope<Standup>>(`/standups/${id}/entries`, {
        method: "PATCH",
        body: { entries },
      })
      setStandup(res.data)
      setBaseline(serializeDrafts(currentDrafts))
      return true
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "Save failed")
      return false
    } finally {
      setSaving(false)
    }
  }, [id, standup, readonly])

  const leaveDialog = (
    <AlertDialog
      open={blocker.status === "blocked"}
      onOpenChange={(open) => {
        if (!open && !leaveBusy) blocker.reset?.()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
          <AlertDialogDescription>
            You have unsaved stand-up edits. Save them before leaving, or discard
            and continue.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
          <AlertDialogCancel disabled={leaveBusy}>Stay</AlertDialogCancel>
          <Button
            type="button"
            variant="outline"
            disabled={leaveBusy}
            onClick={() => {
              blocker.proceed?.()
            }}
          >
            Leave without saving
          </Button>
          <AlertDialogAction
            disabled={leaveBusy}
            onClick={async (e) => {
              e.preventDefault()
              const proceed = blocker.proceed
              setLeaveBusy(true)
              try {
                const saved = await saveAll()
                if (saved) proceed?.()
                else blocker.reset?.()
              } finally {
                setLeaveBusy(false)
              }
            }}
          >
            {leaveBusy ? "Saving…" : "Save & leave"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  if (loading) {
    return (
      <>
        <LoadingState />
        {leaveDialog}
      </>
    )
  }
  if (error) {
    return (
      <>
        <ErrorState message={error} onRetry={load} />
        {leaveDialog}
      </>
    )
  }
  if (!standup) return leaveDialog

  const entries = standup.entries ?? []
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

  const saveAllButton = !readonly ? (
    <Button
      type="button"
      size="sm"
      variant={isDirty ? "default" : "outline"}
      className="gap-1.5"
      disabled={saving || !isDirty}
      onClick={() => void saveAll()}
    >
      <IconDeviceFloppy className="size-3.5" />
      {saving ? "Saving…" : "Save all"}
    </Button>
  ) : null

  return (
    <div>
      <PageHeader
        title={`Stand-up · ${dateLabel}`}
        description="Attendance, notes, and project allocations"
        breadcrumbs={[
          { label: "Stand-ups", to: "/stand-ups", search: { page: 1, pageSize: 25 } },
          { label: dateLabel },
        ]}
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
                disabled={saving}
                onClick={async () => {
                  const ok = await confirm({
                    title: "Complete stand-up?",
                    description:
                      "Current changes will be saved first. Attendance records will be derived. Entries become read-only.",
                    confirmLabel: "Complete",
                  })
                  if (!ok) return
                  try {
                    if (isDirty) {
                      const saved = await saveAll()
                      if (!saved) return
                    }
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
            {isDirty ? <Badge variant="outline">Unsaved changes</Badge> : null}
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

        {saveAllButton}
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

      {!readonly && entries.length > 0 ? (
        <div className="mt-6 flex border-t pt-4">{saveAllButton}</div>
      ) : null}

      {leaveDialog}
      {dialog}

      <Button
        type="button"
        size="icon"
        variant="secondary"
        aria-label="Scroll to top"
        className={`fixed right-4 bottom-4 z-30 size-10 rounded-full shadow-md transition-[opacity,transform] md:right-6 md:bottom-6 ${
          showScrollTop
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-2 opacity-0"
        }`}
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      >
        <IconArrowUp className="size-4" />
      </Button>
    </div>
  )
}
