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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/health-badge"
import { useConfirmDialog } from "@/components/confirm-dialog"
import { ErrorState, LoadingState } from "@/components/ui-states"
import { SHORTCUTS_FAB_BOTTOM_CLASS } from "@/components/keyboard-shortcuts"
import {
  EmployeeStandupCard,
  isEntryComplete,
  isWorking,
  type EntryDraft,
} from "@/components/standup/employee-standup-card"
import { focusStandupNotes } from "@/components/standup/markdown-notes"
import {
  rebalance,
  type DraftAlloc,
} from "@/components/standup/project-allocations"
import { api, ApiError, type Envelope } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import * as Y from "yjs"
import {
  connectStandupCollab,
  type CollabPeer,
} from "@/lib/standup-collab"
import type {
  AssignmentResolution,
  MissingAssignmentAction,
  MissingProjectAssignment,
  Project,
  Standup,
} from "@/lib/types"

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
  return (entries ?? []).map((entry) => {
    const d = drafts[entry.id]
    if (!d) {
      return {
        id: entry.id,
        attendanceStatus: entry.attendanceStatus,
        notesMarkdown: entry.notesMarkdown ?? "",
        allocations: (entry.allocations ?? []).map((a) => ({
          projectId: a.projectId,
          percentage: Number(a.percentage),
          isNonBillable: a.isNonBillable,
        })),
      }
    }
    if (d.attendanceStatus === "absent") {
      return {
        id: entry.id,
        attendanceStatus: "absent" as const,
        notesMarkdown: "",
        allocations: [],
      }
    }
    return {
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
    }
  })
}

function extractMissingAssignmentPayload(body: unknown): MissingProjectAssignment[] | null {
  if (!body || typeof body !== "object") return null

  const direct = body as {
    code?: unknown
    missingAssignments?: unknown
    extensions?: unknown
  }

  if (
    direct.code === "MISSING_PROJECT_ASSIGNMENTS" &&
    Array.isArray(direct.missingAssignments)
  ) {
    return direct.missingAssignments as MissingProjectAssignment[]
  }

  if (direct.extensions && typeof direct.extensions === "object") {
    const nested = direct.extensions as {
      code?: unknown
      missingAssignments?: unknown
    }
    if (
      nested.code === "MISSING_PROJECT_ASSIGNMENTS" &&
      Array.isArray(nested.missingAssignments)
    ) {
      return nested.missingAssignments as MissingProjectAssignment[]
    }
  }

  for (const value of Object.values(body)) {
    if (value && typeof value === "object") {
      const nested = extractMissingAssignmentPayload(value)
      if (nested) return nested
    }
  }

  return null
}

function dayBeforeIso(dateStr: string): string {
  const day = new Date(`${String(dateStr).slice(0, 10)}T00:00:00.000Z`)
  return new Date(day.getTime() - 86_400_000).toISOString().slice(0, 10)
}

function missingAssignmentKey(item: MissingProjectAssignment): string {
  return `${item.employeeId}:${item.projectId}`
}

function defaultResolutionFor(item: MissingProjectAssignment): MissingAssignmentAction {
  if (item.availableActions?.includes("split")) return "split"
  if (item.availableActions?.includes("create")) return "create"
  return item.availableActions?.[0] ?? "remove_allocation"
}

function resolutionLabel(
  action: MissingAssignmentAction,
  item: MissingProjectAssignment,
): string {
  switch (action) {
    case "split":
      if (item.currentAssignedFrom) {
        return `Add historical period (${item.standupDate} – ${dayBeforeIso(item.currentAssignedFrom)})`
      }
      return "Add historical assignment"
    case "backward_extend":
      return `Extend current assignment to ${item.standupDate}`
    case "create":
      return `Link from ${item.standupDate}`
    case "remove_allocation":
      return "Remove allocation for this day"
  }
}

function findLaterActiveAssignment(
  assignments: Array<{
    assignedAt: string
    unassignedAt: string | null
    project?: { id: string }
    projectId?: string
    employeeId?: string
  }> | undefined,
  projectId: string,
  standupDate: string,
) {
  const day = String(standupDate).slice(0, 10)
  let latest: { assignedAt: string } | null = null
  for (const assignment of assignments ?? []) {
    if (assignment.unassignedAt !== null) continue
    const matchesProject =
      assignment.project?.id === projectId || assignment.projectId === projectId
    if (!matchesProject) continue
    const assignedDay = String(assignment.assignedAt).slice(0, 10)
    if (assignedDay > day) {
      if (
        !latest ||
        String(assignment.assignedAt).slice(0, 10) > String(latest.assignedAt).slice(0, 10)
      ) {
        latest = assignment
      }
    }
  }
  return latest
}

function buildAvailableActions(
  laterActive: { assignedAt: string } | null,
): MissingAssignmentAction[] {
  const actions: MissingAssignmentAction[] = ["remove_allocation"]
  if (laterActive) {
    actions.push("backward_extend", "split")
  } else {
    actions.push("create")
  }
  return actions
}

function assignmentCoversDate(
  assignedAt: string,
  unassignedAt: string | null,
  standupDate: string,
): boolean {
  const day = String(standupDate).slice(0, 10)
  const assignedDay = String(assignedAt).slice(0, 10)
  if (assignedDay > day) return false
  if (!unassignedAt) return true
  return String(unassignedAt).slice(0, 10) >= day
}

function hasAssignmentOnDate(
  assignments: Array<{
    assignedAt: string
    unassignedAt: string | null
    project?: { id: string }
    projectId?: string
  }> | undefined,
  projectId: string,
  standupDate: string,
) {
  return (assignments ?? []).some((assignment) => {
    const matchesProject =
      assignment.project?.id === projectId || assignment.projectId === projectId
    if (!matchesProject) return false
    return assignmentCoversDate(
      assignment.assignedAt,
      assignment.unassignedAt,
      standupDate,
    )
  })
}

function hasProjectRosterAssignment(
  projects: Project[],
  employeeId: string,
  projectId: string,
  standupDate: string,
): boolean {
  const project = projects.find((item) => item.id === projectId)
  if (!project?.employeeAssignments?.length) return false
  return project.employeeAssignments.some((assignment) => {
    if (assignment.employeeId !== employeeId) return false
    return assignmentCoversDate(
      assignment.assignedAt,
      assignment.unassignedAt,
      standupDate,
    )
  })
}

/** Empty notes = not edited yet. Absent is also treated as a manual edit. */
function hasManualEntryEdit(draft: EntryDraft): boolean {
  if (draft.attendanceStatus === "absent") return true
  return draft.notesMarkdown.trim().length > 0
}

function assignedProjectIdsOnDate(
  entry: NonNullable<Standup["entries"]>[number],
  standupDate: string,
  projects: Project[],
): string[] {
  const names = new Map<string, string>()
  for (const assignment of entry.employee.assignments ?? []) {
    const projectId = assignment.project?.id ?? assignment.projectId
    if (!projectId) continue
    if (
      !assignmentCoversDate(
        assignment.assignedAt,
        assignment.unassignedAt,
        standupDate,
      )
    ) {
      continue
    }
    names.set(projectId, assignment.project?.name ?? projectId)
  }
  for (const project of projects) {
    if (
      hasProjectRosterAssignment(
        projects,
        entry.employee.id,
        project.id,
        standupDate,
      )
    ) {
      names.set(project.id, project.name)
    }
  }
  return [...names.entries()]
    .sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]))
    .map(([id]) => id)
}

function sameProjectSplit(left: DraftAlloc[], right: DraftAlloc[]): boolean {
  if (left.length !== right.length) return false
  const percents = new Map(
    left.map((item) => [item.projectId, Number(item.percentage) || 0]),
  )
  return right.every(
    (item) => percents.get(item.projectId) === (Number(item.percentage) || 0),
  )
}

function applyAssignedProjectDefaults(
  drafts: Record<string, EntryDraft>,
  standup: Standup,
  projects: Project[],
): Record<string, EntryDraft> {
  if (standup.status === "completed") return drafts
  const standupDate = String(standup.date).slice(0, 10)
  let changed = false
  const next = { ...drafts }
  for (const entry of standup.entries ?? []) {
    const draft = next[entry.id]
    if (!draft || hasManualEntryEdit(draft)) continue
    const allocations = rebalance(
      assignedProjectIdsOnDate(entry, standupDate, projects).map((projectId) => ({
        projectId,
        percentage: 0,
        locked: false,
      })),
    )
    if (sameProjectSplit(draft.allocations, allocations)) continue
    next[entry.id] = { ...draft, allocations }
    changed = true
  }
  return changed ? next : drafts
}

function getMissingAssignmentsFromStandup(
  standup: Standup,
  drafts: Record<string, EntryDraft>,
  projects: Project[],
): MissingProjectAssignment[] {
  const seen = new Set<string>()
  const result: MissingProjectAssignment[] = []
  const standupDate = String(standup.date).slice(0, 10)

  for (const entry of standup.entries ?? []) {
    const draft = drafts[entry.id]
    if (!draft || draft.attendanceStatus === "absent") continue
    for (const allocation of draft.allocations.filter((item) => item.projectId)) {
      if (
        hasAssignmentOnDate(
          entry.employee.assignments,
          allocation.projectId,
          standup.date,
        ) ||
        hasProjectRosterAssignment(
          projects,
          entry.employee.id,
          allocation.projectId,
          standup.date,
        )
      ) {
        continue
      }
      const key = `${entry.employee.id}:${allocation.projectId}`
      if (seen.has(key)) continue
      seen.add(key)

      const project = projects.find((item) => item.id === allocation.projectId)
      const projectRoster = project?.employeeAssignments?.filter(
        (item) => item.employeeId === entry.employee.id,
      )
      const laterActive =
        findLaterActiveAssignment(
          entry.employee.assignments,
          allocation.projectId,
          standup.date,
        ) ??
        findLaterActiveAssignment(projectRoster, allocation.projectId, standup.date)

      const availableActions = buildAvailableActions(laterActive)

      result.push({
        employeeId: entry.employee.id,
        employeeName: entry.employee.name,
        projectId: allocation.projectId,
        projectName: project?.name ?? allocation.projectId,
        standupDate,
        standupEntryId: entry.id,
        currentAssignedFrom: laterActive
          ? String(laterActive.assignedAt).slice(0, 10)
          : null,
        availableActions,
      })
    }
  }

  return result
}

function nextWorkingEntryId(
  visibleIds: string[],
  workingIds: string[],
  currentId: string,
): string | "save" {
  const visIndex = visibleIds.indexOf(currentId)
  const start = visIndex === -1 ? 0 : visIndex + 1
  for (let i = start; i < visibleIds.length; i++) {
    const id = visibleIds[i]!
    if (workingIds.includes(id)) return id
  }
  return "save"
}

function previousWorkingEntryId(
  visibleIds: string[],
  workingIds: string[],
  currentId: string,
): string | null {
  const visIndex = visibleIds.indexOf(currentId)
  const start = visIndex === -1 ? visibleIds.length - 1 : visIndex - 1
  for (let i = start; i >= 0; i--) {
    const id = visibleIds[i]!
    if (workingIds.includes(id)) return id
  }
  return null
}

function StandupDetailPage() {
  const { id } = Route.useParams()
  const { user } = useAuth()
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
  const [groupMemberIds, setGroupMemberIds] = React.useState<Set<string> | null>(null)
  const [showAllEmployees, setShowAllEmployees] = React.useState(
    () => user?.standupScopePreference !== "group",
  )
  const [missingAssignments, setMissingAssignments] = React.useState<
    MissingProjectAssignment[]
  >([])
  const [resolutionChoices, setResolutionChoices] = React.useState<
    Record<string, MissingAssignmentAction>
  >({})
  const [missingAssignmentOpen, setMissingAssignmentOpen] = React.useState(false)
  const [messageDialog, setMessageDialog] = React.useState<{
    title: string
    description: string
  } | null>(null)
  const notesMapRef = React.useRef<Y.Map<string> | null>(null)
  const draftsRef = React.useRef(drafts)
  draftsRef.current = drafts
  const saveAllEndRef = React.useRef<HTMLButtonElement | null>(null)
  const tabNavRef = React.useRef({
    readonly: true,
    visibleIds: [] as string[],
    workingIds: [] as string[],
  })

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
      const fromServer = draftsFromStandup(s.data)
      const next = applyAssignedProjectDefaults(fromServer, s.data, p.data)
      setDrafts(next)
      setBaseline(serializeDrafts(fromServer))
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
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return
      const { readonly, visibleIds, workingIds } = tabNavRef.current
      if (readonly || workingIds.length === 0) return
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      if (target.closest("[role='dialog'], [role='alertdialog']")) return

      const saveAll = saveAllEndRef.current
      const inSaveAll = Boolean(
        saveAll && (target === saveAll || saveAll.contains(target)),
      )
      const entryId = target.closest("[data-standup-entry]")?.getAttribute(
        "data-standup-entry",
      )
      const inNotes = Boolean(target.closest("[data-standup-notes]"))

      if (event.shiftKey) {
        if (inSaveAll) {
          event.preventDefault()
          event.stopPropagation()
          focusStandupNotes(workingIds[workingIds.length - 1]!)
          return
        }
        if (!entryId) return
        if (workingIds.includes(entryId) && !inNotes) {
          event.preventDefault()
          event.stopPropagation()
          focusStandupNotes(entryId)
          return
        }
        const previous = previousWorkingEntryId(visibleIds, workingIds, entryId)
        if (!previous) return
        event.preventDefault()
        event.stopPropagation()
        focusStandupNotes(previous)
        return
      }

      if (inSaveAll) return
      if (!entryId) return
      if (workingIds.includes(entryId) && !inNotes) {
        event.preventDefault()
        event.stopPropagation()
        focusStandupNotes(entryId)
        return
      }
      event.preventDefault()
      event.stopPropagation()
      const next = nextWorkingEntryId(visibleIds, workingIds, entryId)
      if (next === "save") {
        saveAll?.focus()
        saveAll?.scrollIntoView({ block: "nearest", behavior: "smooth" })
      } else {
        focusStandupNotes(next)
      }
    }

    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [])

  React.useEffect(() => {
    setShowAllEmployees(user?.standupScopePreference !== "group")
  }, [user?.standupScopePreference, id])

  React.useEffect(() => {
    const groupId = user?.standupPreferredGroupId
    if (user?.standupScopePreference !== "group" || !groupId) {
      setGroupMemberIds(null)
      return
    }
    let cancelled = false
    void api<Envelope<{ members?: Array<{ employeeId: string }> }>>(
      `/employee-groups/${groupId}`,
    )
      .then((res) => {
        if (cancelled) return
        const ids = new Set((res.data.members ?? []).map((member) => member.employeeId))
        setGroupMemberIds(ids)
      })
      .catch(() => {
        if (!cancelled) setGroupMemberIds(null)
      })
    return () => {
      cancelled = true
    }
  }, [user?.standupScopePreference, user?.standupPreferredGroupId])

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

  const openMissingAssignmentDialog = (items: MissingProjectAssignment[]) => {
    const normalized = items.map((item) => ({
      ...item,
      availableActions:
        item.availableActions ??
        (item.currentAssignedFrom
          ? (["remove_allocation", "backward_extend", "split"] as const)
          : (["remove_allocation", "create"] as const)),
    }))
    setMissingAssignments(normalized)
    setResolutionChoices(
      Object.fromEntries(
        normalized.map((item) => [missingAssignmentKey(item), defaultResolutionFor(item)]),
      ),
    )
    setMissingAssignmentOpen(true)
  }

  const saveAll = React.useCallback(async (options?: {
    assignmentResolutions?: AssignmentResolution[]
  }) => {
    if (!standup || readonly) return false
    const currentDrafts = draftsRef.current
    const entries = buildEntriesPayload(standup.entries, currentDrafts)
    if (entries.length === 0) return true
    if (!options?.assignmentResolutions) {
      const pendingAssignments = getMissingAssignmentsFromStandup(
        standup,
        currentDrafts,
        projects,
      )
      if (pendingAssignments.length > 0) {
        openMissingAssignmentDialog(pendingAssignments)
        return false
      }
    }
    setSaving(true)
    try {
      const res = await api<Envelope<Standup>>(`/standups/${id}/entries`, {
        method: "PATCH",
        body: {
          entries,
          assignmentResolutions: options?.assignmentResolutions,
        },
      })
      setStandup(res.data)
      const nextDrafts = draftsFromStandup(res.data)
      setDrafts(nextDrafts)
      setBaseline(serializeDrafts(nextDrafts))
      setMissingAssignments([])
      setResolutionChoices({})
      setMissingAssignmentOpen(false)
      return true
    } catch (e) {
      if (e instanceof ApiError) {
        const items = extractMissingAssignmentPayload(e.body)
        if (items?.length) {
          openMissingAssignmentDialog(items)
          return false
        }
      }
      setMessageDialog({
        title: "Save failed",
        description: e instanceof ApiError ? e.message : "Failed to save stand-up changes.",
      })
      return false
    } finally {
      setSaving(false)
    }
  }, [id, standup, readonly, projects])

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

  const missingAssignmentDialog = (
    <AlertDialog
      open={missingAssignmentOpen}
      onOpenChange={(open) => {
        if (!saving) setMissingAssignmentOpen(open)
      }}
    >
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Resolve project assignments</AlertDialogTitle>
          <AlertDialogDescription>
            These employees are allocated to projects they were not assigned to on
            the stand-up date. Choose how to resolve each item before saving.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="max-h-80 space-y-3 overflow-y-auto rounded-md border p-3 text-sm">
          {missingAssignments.map((item) => {
            const key = missingAssignmentKey(item)
            const actions = item.availableActions ?? ["remove_allocation"]
            const actionItems = Object.fromEntries(
              actions.map((action) => [action, resolutionLabel(action, item)]),
            )
            return (
              <div
                key={key}
                className="space-y-2 rounded-md border bg-muted/30 px-3 py-3"
              >
                <div className="font-medium">{item.employeeName}</div>
                <div className="text-muted-foreground">
                  {item.projectName} · stand-up {item.standupDate}
                </div>
                {item.currentAssignedFrom ? (
                  <p className="text-xs text-muted-foreground">
                    Currently assigned from {item.currentAssignedFrom}. The stand-up
                    date is before that assignment started.
                  </p>
                ) : null}
                <Select
                  value={resolutionChoices[key] ?? defaultResolutionFor(item)}
                  onValueChange={(value) => {
                    if (!value) return
                    setResolutionChoices((prev) => ({
                      ...prev,
                      [key]: value as MissingAssignmentAction,
                    }))
                  }}
                  items={actionItems}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose resolution" />
                  </SelectTrigger>
                  <SelectContent>
                    {actions.map((action) => (
                      <SelectItem key={action} value={action}>
                        {resolutionLabel(action, item)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )
          })}
        </div>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
          <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={saving}
            onClick={async (e) => {
              e.preventDefault()
              const assignmentResolutions: AssignmentResolution[] =
                missingAssignments.map((item) => ({
                  employeeId: item.employeeId,
                  projectId: item.projectId,
                  action:
                    resolutionChoices[missingAssignmentKey(item)] ??
                    defaultResolutionFor(item),
                }))
              await saveAll({ assignmentResolutions })
            }}
          >
            {saving ? "Saving…" : "Apply and save"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  const infoDialog = (
    <AlertDialog
      open={Boolean(messageDialog)}
      onOpenChange={(open) => {
        if (!open) setMessageDialog(null)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{messageDialog?.title}</AlertDialogTitle>
          <AlertDialogDescription>{messageDialog?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={() => setMessageDialog(null)}>OK</AlertDialogAction>
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
  const groupFilterActive =
    user?.standupScopePreference === "group" &&
    user?.standupPreferredGroupId &&
    groupMemberIds &&
    !showAllEmployees
  const visible = entries.filter((e) => {
    if (groupFilterActive && !groupMemberIds.has(e.employee.id)) return false
    if (!q) return true
    const hay = `${e.employee.name} ${e.employee.email}`.toLowerCase()
    return hay.includes(q)
  })
  const hiddenGroupCount = groupFilterActive
    ? entries.filter((e) => !groupMemberIds.has(e.employee.id)).length
    : 0

  const working = entries.filter((e) => {
    const d = drafts[e.id]
    return d ? isWorking(d.attendanceStatus) : e.attendanceStatus !== "absent"
  })
  const done = working.filter((e) => {
    const d = drafts[e.id]
    return d ? isEntryComplete(d) : false
  })
  const absentCount = entries.length - working.length

  tabNavRef.current = {
    readonly,
    visibleIds: visible.map((entry) => entry.id),
    workingIds: visible
      .filter((entry) => {
        const draft = drafts[entry.id]
        return draft
          ? isWorking(draft.attendanceStatus)
          : entry.attendanceStatus !== "absent"
      })
      .map((entry) => entry.id),
  }

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
      setMessageDialog({
        title: "Copy failed",
        description: "Could not copy the stand-up summary to the clipboard.",
      })
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

  const saveAllEndButton = !readonly ? (
    <Button
      ref={saveAllEndRef}
      type="button"
      size="sm"
      variant={isDirty ? "default" : "outline"}
      className={`gap-1.5 ${!isDirty || saving ? "opacity-50" : ""}`}
      data-standup-save-all=""
      disabled={saving}
      aria-disabled={!isDirty || saving}
      onClick={() => {
        if (!isDirty || saving) return
        void saveAll()
      }}
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
                    setMessageDialog({
                      title: "Complete failed",
                      description:
                        e instanceof ApiError
                          ? e.message
                          : "Failed to complete this stand-up.",
                    })
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

        {user?.standupScopePreference === "group" && user.standupPreferredGroupId ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setShowAllEmployees((prev) => !prev)}
          >
            {showAllEmployees
              ? `Show ${user.standupPreferredGroup?.name ?? "my group"}`
              : "Show everyone"}
          </Button>
        ) : null}

        {hiddenGroupCount > 0 && !query.trim() ? (
          <Badge variant="outline">{hiddenGroupCount} hidden by group filter</Badge>
        ) : null}

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
                : groupFilterActive
                  ? "No employees from your group in this stand-up."
                  : "No employees in this stand-up."}
            </CardContent>
          </Card>
        ) : null}
      </div>

      {!readonly && entries.length > 0 ? (
        <div className="mt-6 flex border-t pt-4">{saveAllEndButton}</div>
      ) : null}

      {leaveDialog}
      {missingAssignmentDialog}
      {infoDialog}
      {dialog}

      <Button
        type="button"
        size="icon"
        variant="secondary"
        aria-label="Scroll to top"
        className={`fixed right-4 z-30 size-10 rounded-full shadow-md transition-[opacity,transform] md:right-6 ${SHORTCUTS_FAB_BOTTOM_CLASS} ${
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
