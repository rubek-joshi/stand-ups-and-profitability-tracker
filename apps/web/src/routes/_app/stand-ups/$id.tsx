import * as React from "react"
import { createFileRoute, useBlocker } from "@tanstack/react-router"
import {
  IconArrowUp,
  IconCalendar,
  IconClipboard,
  IconDeviceFloppy,
  IconDotsVertical,
  IconLayoutGrid,
  IconNotes,
  IconSearch,
  IconTable,
  IconTrash,
  IconUsers,
  IconX,
} from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { PageHeader } from "@/components/page-header"
import { useConfirmDialog } from "@/components/confirm-dialog"
import { ErrorState, LoadingState } from "@/components/ui-states"
import { SHORTCUTS_FAB_BOTTOM_CLASS } from "@/components/keyboard-shortcuts"
import {
  ATTENDANCE_META,
  buildEntriesPayload,
  draftsFromStandup,
  isEntryComplete,
  isProjectSelectableForStandup,
  isWorking,
  serializeDrafts,
  type EntryDraft,
} from "@/components/standup/entry-draft"
import { StandupCardView } from "@/components/standup/standup-card-view"
import { StandupTableView } from "@/components/standup/table-view"
import { advanceStandupFocus } from "@/components/standup/standup-focus-nav"
import { toggleMiscellaneousNotes } from "@/components/standup/miscellaneous-notes-toggle"
import { focusStandupNotes, MarkdownNotes } from "@/components/standup/markdown-notes"
import { StandupGuidelinesControl } from "@/components/standup/standup-guidelines-dialog"
import { formatTaskForCopy } from "@/components/standup/task-indent"
import {
  rebalance,
  type DraftAlloc,
} from "@/components/standup/project-allocations"
import { api, ApiError, type Envelope } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { primaryModifierPressed } from "@/lib/keyboard"
import {
  STANDUP_DELETABLE_DAYS,
  STANDUP_EDITABLE_DAYS,
  isStandupDeletable,
  isStandupEditable,
} from "@/lib/standup-age"
import { toast } from "@workspace/ui/components/toast"
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
  StandupLayoutPreference,
} from "@/lib/types"

export const Route = createFileRoute("/_app/stand-ups/$id")({
  component: StandupDetailPage,
})

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

function entryHasTasks(draft: EntryDraft): boolean {
  return draft.allocations.some((a) =>
    a.tasks.some((t) => t.text.trim().length > 0),
  )
}

function shouldApplyAssignedDefaults(draft: EntryDraft): boolean {
  if (draft.attendanceStatus === "absent") return false
  if (draft.allocations.length > 0) return false
  if (draft.miscellaneousNotes.trim().length > 0) return false
  if (entryHasTasks(draft)) return false
  return true
}

function assignedProjectIdsOnDate(
  entry: NonNullable<Standup["entries"]>[number],
  standupDate: string,
  projects: Project[],
): string[] {
  const selectableProjects = projects.filter(isProjectSelectableForStandup)
  const selectableProjectIds = new Set(selectableProjects.map((p) => p.id))
  const names = new Map<string, string>()
  for (const assignment of entry.employee.assignments ?? []) {
    const projectId = assignment.project?.id ?? assignment.projectId
    if (!projectId || !selectableProjectIds.has(projectId)) continue
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
  for (const project of selectableProjects) {
    if (
      hasProjectRosterAssignment(
        selectableProjects,
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
  if (!isStandupEditable(String(standup.date))) return drafts
  const standupDate = String(standup.date).slice(0, 10)
  let changed = false
  const next = { ...drafts }
  for (const entry of standup.entries ?? []) {
    const draft = next[entry.id]
    if (!draft || !shouldApplyAssignedDefaults(draft)) continue
    const allocations = rebalance(
      assignedProjectIdsOnDate(entry, standupDate, projects).map((projectId) => ({
        projectId,
        percentage: 0,
        locked: false,
      })),
    ).map((a) => ({ ...a, tasks: [] as EntryDraft["allocations"][number]["tasks"] }))
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
  employeeIds?: Set<string> | null,
): MissingProjectAssignment[] {
  const seen = new Set<string>()
  const result: MissingProjectAssignment[] = []
  const standupDate = String(standup.date).slice(0, 10)

  for (const entry of standup.entries ?? []) {
    if (employeeIds && !employeeIds.has(entry.employee.id)) continue
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

function serializeCollabEntry(draft: EntryDraft): string {
  return JSON.stringify({
    miscellaneousNotes: draft.miscellaneousNotes,
    attendanceStatus: draft.attendanceStatus,
    allocations: draft.allocations,
  })
}

function syncDraftsToYjs(
  map: Y.Map<string> | null,
  drafts: Record<string, EntryDraft>,
) {
  if (!map) return
  const apply = () => {
    for (const [entryId, draft] of Object.entries(drafts)) {
      const serialized = serializeCollabEntry(draft)
      if (map.get(entryId) !== serialized) {
        map.set(entryId, serialized)
      }
    }
  }
  const doc = map.doc
  if (doc) {
    doc.transact(apply, "hydrate-from-server")
  } else {
    apply()
  }
}

function parseCollabEntry(raw: string, fallback: EntryDraft): EntryDraft {
  try {
    const parsed = JSON.parse(raw) as Partial<EntryDraft>
    return {
      attendanceStatus: parsed.attendanceStatus ?? fallback.attendanceStatus,
      miscellaneousNotes:
        typeof parsed.miscellaneousNotes === "string"
          ? parsed.miscellaneousNotes
          : fallback.miscellaneousNotes,
      allocations: Array.isArray(parsed.allocations)
        ? parsed.allocations.map((a) => ({
            projectId: a.projectId,
            percentage: a.percentage,
            isNonBillable: a.isNonBillable,
            locked: Boolean(a.locked),
            tasks: Array.isArray(a.tasks) ? a.tasks : [],
          }))
        : fallback.allocations,
    }
  } catch {
    return fallback
  }
}

function StandupDetailPage() {
  const { id } = Route.useParams()
  const { user, refreshUser } = useAuth()
  const { confirm, dialog } = useConfirmDialog()
  const [standup, setStandup] = React.useState<Standup | null>(null)
  const [standupMiscNotes, setStandupMiscNotes] = React.useState("")
  const [baselineStandupMiscNotes, setBaselineStandupMiscNotes] = React.useState("")
  const [showOverallNotes, setShowOverallNotes] = React.useState(false)
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
  const [layout, setLayout] = React.useState<StandupLayoutPreference>(
    () => user?.standupLayoutPreference ?? "card",
  )
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
  const entriesMapRef = React.useRef<Y.Map<string> | null>(null)
  const draftsRef = React.useRef(drafts)
  draftsRef.current = drafts
  const draftsReadyRef = React.useRef(false)
  const collabStateAppliedRef = React.useRef(false)
  const yjsHydratedFromServerRef = React.useRef(false)
  const hydrateYjsFromDraftsRef = React.useRef(
    (_drafts?: Record<string, EntryDraft>) => {},
  )
  hydrateYjsFromDraftsRef.current = (incoming) => {
    const map = entriesMapRef.current
    const draftsToWrite = incoming ?? draftsRef.current
    if (!map || !collabStateAppliedRef.current || !draftsReadyRef.current) {
      return
    }
    if (yjsHydratedFromServerRef.current) return
    if (Object.keys(draftsToWrite).length === 0) return
    syncDraftsToYjs(map, draftsToWrite)
    yjsHydratedFromServerRef.current = true
  }
  const visibleEntriesRef = React.useRef<Array<{ id: string }>>([])

  const readonly = Boolean(standup && !isStandupEditable(String(standup.date)))
  const canDelete =
    user?.role === "super_admin" &&
    Boolean(standup && isStandupDeletable(String(standup.date)))
  const deleteBlockedByAge =
    user?.role === "super_admin" &&
    Boolean(standup && !isStandupDeletable(String(standup.date)))
  const navigate = Route.useNavigate()
  const skipLeaveBlockRef = React.useRef(false)
  const isDirty =
    Boolean(standup) &&
    !readonly &&
    baseline !== "" &&
    (serializeDrafts(drafts) !== baseline ||
      standupMiscNotes !== baselineStandupMiscNotes)

  const blocker = useBlocker({
    shouldBlockFn: () => isDirty && !skipLeaveBlockRef.current,
    withResolver: true,
    enableBeforeUnload: isDirty,
  })

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    draftsReadyRef.current = false
    yjsHydratedFromServerRef.current = false
    try {
      const [s, p] = await Promise.all([
        api<Envelope<Standup>>(`/standups/${id}`),
        api<Envelope<Project[]>>("/projects"),
      ])
      setStandup(s.data)
      setProjects(p.data)
      const fromServer = draftsFromStandup(s.data.entries)
      const next = applyAssignedProjectDefaults(fromServer, s.data, p.data)
      draftsRef.current = next
      draftsReadyRef.current = true
      setDrafts(next)
      setBaseline(serializeDrafts(fromServer))
      setStandupMiscNotes(s.data.miscellaneousNotes ?? "")
      setBaselineStandupMiscNotes(s.data.miscellaneousNotes ?? "")
      hydrateYjsFromDraftsRef.current(next)
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
    setLayout(user?.standupLayoutPreference ?? "card")
  }, [user?.standupLayoutPreference, id])

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
    collabStateAppliedRef.current = false
    yjsHydratedFromServerRef.current = false
    const session = connectStandupCollab(id, (nextPeers) => {
      collabStateAppliedRef.current = true
      setPeers(nextPeers)
      setCollabConnected(true)
      hydrateYjsFromDraftsRef.current()
    })
    const entriesMap = session.doc.getMap<string>("entries")
    entriesMapRef.current = entriesMap
    const observer = () => {
      // Wait until saved stand-up data has replaced the persisted Yjs snapshot.
      if (!yjsHydratedFromServerRef.current) return
      setDrafts((prev) => {
        const next = { ...prev }
        let changed = false
        for (const [entryId, raw] of entriesMap.entries()) {
          if (typeof raw !== "string" || !next[entryId]) continue
          const merged = parseCollabEntry(raw, next[entryId]!)
          if (serializeCollabEntry(merged) === serializeCollabEntry(next[entryId]!)) {
            continue
          }
          next[entryId] = merged
          changed = true
        }
        return changed ? next : prev
      })
    }
    entriesMap.observe(observer)
    return () => {
      entriesMap.unobserve(observer)
      entriesMapRef.current = null
      collabStateAppliedRef.current = false
      yjsHydratedFromServerRef.current = false
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
    redirectToList?: boolean
  }) => {
    if (!standup || readonly) return false
    const currentDrafts = draftsRef.current
    const scopeEmployeeIds =
      user?.standupScopePreference === "group" &&
      user.standupPreferredGroupId &&
      groupMemberIds &&
      !showAllEmployees
        ? groupMemberIds
        : null
    const entries = buildEntriesPayload(
      standup.entries,
      currentDrafts,
      scopeEmployeeIds,
    )
    if (entries.length === 0) return true
    if (!options?.assignmentResolutions) {
      const pendingAssignments = getMissingAssignmentsFromStandup(
        standup,
        currentDrafts,
        projects,
        scopeEmployeeIds,
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
          miscellaneousNotes: standupMiscNotes,
          assignmentResolutions: options?.assignmentResolutions,
        },
      })
      setStandup(res.data)
      setStandupMiscNotes(res.data.miscellaneousNotes ?? "")
      setBaselineStandupMiscNotes(res.data.miscellaneousNotes ?? "")
      const nextDrafts = draftsFromStandup(res.data.entries)
      draftsRef.current = nextDrafts
      setDrafts(nextDrafts)
      setBaseline(serializeDrafts(nextDrafts))
      syncDraftsToYjs(entriesMapRef.current, nextDrafts)
      setMissingAssignments([])
      setResolutionChoices({})
      setMissingAssignmentOpen(false)
      toast.add({
        title: "Stand-up saved successfully",
        type: "success",
      })
      if (options?.redirectToList !== false) {
        skipLeaveBlockRef.current = true
        await navigate({
          to: "/stand-ups",
          search: {
            page: 1,
            pageSize: 25,
            view: "list",
            q: "",
            employeeIds: "",
            projectId: "",
            from: "",
            to: "",
          },
        })
      }
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
  }, [id, standup, readonly, projects, user, groupMemberIds, showAllEmployees, navigate])

  const handleDraftChange = React.useCallback(
    (entryId: string, next: EntryDraft) => {
      draftsRef.current = { ...draftsRef.current, [entryId]: next }
      setDrafts(draftsRef.current)
      const map = entriesMapRef.current
      if (!map) return
      const serialized = serializeCollabEntry(next)
      if (map.get(entryId) !== serialized) {
        map.set(entryId, serialized)
      }
    },
    [],
  )
  const handleDraftChangeRef = React.useRef(handleDraftChange)
  handleDraftChangeRef.current = handleDraftChange

  const changeLayout = React.useCallback(
    async (next: StandupLayoutPreference) => {
      setLayout(next)
      try {
        await api("/auth/me", {
          method: "PATCH",
          body: { standupLayoutPreference: next },
        })
        await refreshUser()
      } catch {
        // Preference persistence is best-effort.
      }
    },
    [refreshUser],
  )
  const layoutRef = React.useRef(layout)
  layoutRef.current = layout
  const changeLayoutRef = React.useRef(changeLayout)
  changeLayoutRef.current = changeLayout

  const toggleOverallNotes = React.useCallback(() => {
    setShowOverallNotes((prev) => {
      const next = !prev
      if (next) {
        window.setTimeout(() => focusStandupNotes(`standup-${id}-misc`), 40)
      }
      return next
    })
  }, [id])
  const toggleOverallNotesRef = React.useRef(toggleOverallNotes)
  toggleOverallNotesRef.current = toggleOverallNotes

  React.useEffect(() => {
    const isDialogTarget = (target: EventTarget | null) =>
      target instanceof Element &&
      Boolean(
        target.closest('[role="dialog"], [data-slot="alert-dialog-content"]'),
      )

    const currentEntryId = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return null
      return target.closest("[data-standup-entry]")?.getAttribute("data-standup-entry")
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return
      if (isDialogTarget(event.target)) return

      // Alt+M → toggle overall stand-up miscellaneous notes
      if (
        event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === "m"
      ) {
        event.preventDefault()
        event.stopPropagation()
        toggleOverallNotesRef.current()
        return
      }

      if (event.altKey) return

      const mod = primaryModifierPressed(event)
      const key = event.key.toLowerCase()

      // Ctrl+Shift+V → toggle card / table view (works even when readonly)
      if (mod && event.shiftKey && key === "v") {
        event.preventDefault()
        event.stopPropagation()
        void changeLayoutRef.current(
          layoutRef.current === "table" ? "card" : "table",
        )
        return
      }

      if (readonly) return

      // Ctrl+Enter → next project / employee
      if (mod && !event.shiftKey && event.key === "Enter") {
        event.preventDefault()
        event.stopPropagation()
        const moved = advanceStandupFocus(
          visibleEntriesRef.current,
          draftsRef.current,
          event.target,
        )
        if (!moved) {
          toast.add({
            title: "Reached the end",
            type: "info",
          })
        }
        return
      }

      // Ctrl+Shift+A → toggle Absent / Present for current employee
      if (mod && event.shiftKey && key === "a") {
        const entryId = currentEntryId(event.target)
        if (!entryId) return
        const draft = draftsRef.current[entryId]
        if (!draft) return
        event.preventDefault()
        event.stopPropagation()
        handleDraftChangeRef.current(entryId, {
          ...draft,
          attendanceStatus:
            draft.attendanceStatus === "absent" ? "present" : "absent",
        })
        return
      }

      // Ctrl+Shift+N → toggle miscellaneous notes for current employee
      if (mod && event.shiftKey && key === "n") {
        const entryId = currentEntryId(event.target)
        if (!entryId) return
        event.preventDefault()
        event.stopPropagation()
        toggleMiscellaneousNotes(entryId)
      }
    }

    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [readonly])

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
                const saved = await saveAll({ redirectToList: false })
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

  visibleEntriesRef.current = visible

  const scopedEntries = groupFilterActive
    ? entries.filter((e) => groupMemberIds.has(e.employee.id))
    : entries
  const working = scopedEntries.filter((e) => {
    const d = drafts[e.id]
    return d ? isWorking(d.attendanceStatus) : e.attendanceStatus !== "absent"
  })
  const done = working.filter((e) => {
    const d = drafts[e.id]
    return d ? isEntryComplete(d) : false
  })
  const absentCount = scopedEntries.length - working.length

  const dateLabel = new Date(String(standup.date).slice(0, 10)).toLocaleDateString(
    undefined,
    { weekday: "long", day: "numeric", month: "long", year: "numeric" },
  )

  const copySummary = async () => {
    const lines = entries.map((e) => {
      const d = drafts[e.id]
      if (!d) return `## ${e.employee.name}`
      const status =
        ATTENDANCE_META[d.attendanceStatus]?.label ?? d.attendanceStatus
      if (!isWorking(d.attendanceStatus)) return `## ${e.employee.name} — ${status}`
      const split =
        d.allocations
          .map((a) => {
            const name = projects.find((p) => p.id === a.projectId)?.name ?? a.projectId
            return `${name} ${a.percentage}%`
          })
          .join(", ") || "no projects"
      const taskBlocks = d.allocations
        .map((a) => {
          const name = projects.find((p) => p.id === a.projectId)?.name ?? a.projectId
          const tasks = a.tasks.filter((t) => t.text.trim().length > 0)
          if (tasks.length === 0) return null
          return `### ${name}\n${tasks
            .map((t) => formatTaskForCopy(t.text, t.blocker))
            .join("\n")}`
        })
        .filter(Boolean)
        .join("\n\n")
      const misc = d.miscellaneousNotes.trim()
      const parts = [
        `## ${e.employee.name} — ${status}`,
        `_${split}_`,
        taskBlocks || null,
        misc ? `Misc:\n${misc}` : null,
      ].filter(Boolean)
      if (!taskBlocks && !misc) parts.push("(no notes)")
      return parts.join("\n")
    })
    const overallMisc = standupMiscNotes.trim()
    const text = `# Stand-up · ${dateLabel}${overallMisc ? `\n\n## Stand-up Notes\n${overallMisc}` : ""}\n\n${lines.join("\n\n")}`
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

  const miscNotesButton = (
    <Button
      type="button"
      size="sm"
      variant={showOverallNotes ? "secondary" : "outline"}
      className="gap-1.5"
      aria-expanded={showOverallNotes}
      aria-label={
        showOverallNotes
          ? "Hide stand-up miscellaneous notes"
          : "Show stand-up miscellaneous notes"
      }
      title="Stand-up notes (Alt+M)"
      onClick={toggleOverallNotes}
    >
      <IconNotes className="size-3.5" />
      <span>Notes</span>
      {standupMiscNotes.trim().length > 0 && !showOverallNotes ? (
        <span
          aria-hidden
          className="size-1.5 rounded-full bg-primary"
        />
      ) : null}
    </Button>
  )

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
        description="Attendance, tasks, and project allocations"
        breadcrumbs={[
          { label: "Stand-ups", to: "/stand-ups", search: { page: 1, pageSize: 25, view: "list", q: "", employeeIds: "", projectId: "", from: "", to: "" } },
          { label: dateLabel },
        ]}
        actions={
          <div className="flex items-center gap-2">
            {user?.role === "super_admin" ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Stand-up actions"
                    />
                  }
                >
                  <IconDotsVertical />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-40">
                  <DropdownMenuGroup>
                    {canDelete ? (
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={async () => {
                          const ok = await confirm({
                            title: "Delete stand-up?",
                            description:
                              "This permanently deletes the stand-up, its entries, and derived attendance. Type I understand to confirm.",
                            confirmLabel: "Delete",
                            confirmPhrase: "I understand",
                            destructive: true,
                          })
                          if (!ok) return
                          try {
                            await api(`/standups/${id}`, { method: "DELETE" })
                            void navigate({
                              to: "/stand-ups",
                              search: {
                                page: 1,
                                pageSize: 25,
                                view: "list",
                                q: "",
                                employeeIds: "",
                                projectId: "",
                                from: "",
                                to: "",
                              },
                            })
                          } catch (e) {
                            setMessageDialog({
                              title: "Delete failed",
                              description:
                                e instanceof ApiError
                                  ? e.message
                                  : "Failed to delete this stand-up.",
                            })
                          }
                        }}
                      >
                        <IconTrash />
                        Delete
                      </DropdownMenuItem>
                    ) : deleteBlockedByAge ? (
                      <Tooltip>
                        <TooltipTrigger
                          render={<div className="w-full cursor-not-allowed" />}
                        >
                          <DropdownMenuItem disabled variant="destructive">
                            <IconTrash />
                            Delete
                          </DropdownMenuItem>
                        </TooltipTrigger>
                        <TooltipContent>
                          Cannot delete stand-ups older than{" "}
                          {STANDUP_DELETABLE_DAYS} days
                        </TooltipContent>
                      </Tooltip>
                    ) : null}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        }
      />

      {readonly ? (
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          This stand-up is older than {STANDUP_EDITABLE_DAYS} days and is
          read-only.
        </div>
      ) : null}

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

        <div className="flex items-center gap-1 rounded-md border p-0.5">
          <Button
            type="button"
            size="sm"
            variant={layout === "card" ? "secondary" : "ghost"}
            className="h-8 gap-1.5 px-2.5"
            aria-pressed={layout === "card"}
            onClick={() => void changeLayout("card")}
          >
            <IconLayoutGrid className="size-3.5" />
            Cards
          </Button>
          <Button
            type="button"
            size="sm"
            variant={layout === "table" ? "secondary" : "ghost"}
            className="h-8 gap-1.5 px-2.5"
            aria-pressed={layout === "table"}
            onClick={() => void changeLayout("table")}
          >
            <IconTable className="size-3.5" />
            Table
          </Button>
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

        <StandupGuidelinesControl
          viewingEveryone={
            user?.standupScopePreference !== "group" ||
            !user?.standupPreferredGroupId ||
            showAllEmployees
          }
          preferredGroupId={user?.standupPreferredGroupId}
        />

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

        {miscNotesButton}

        {saveAllButton}
      </div>

      {showOverallNotes ? (
        <Card className="mb-6 border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <div className="flex items-center gap-2">
              <IconNotes className="size-4 text-primary" />
              <CardTitle className="text-base font-semibold">
                Stand-up miscellaneous notes
              </CardTitle>
            </div>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              onClick={() => setShowOverallNotes(false)}
              aria-label="Close stand-up notes"
            >
              <IconX className="size-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <MarkdownNotes
              editorKey={`standup-${id}-misc`}
              value={standupMiscNotes}
              disabled={readonly}
              onChange={setStandupMiscNotes}
              placeholder="General notes, announcements, or blockers for today's stand-up…"
            />
          </CardContent>
        </Card>
      ) : null}

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
      ) : layout === "table" ? (
        <StandupTableView
          entries={visible}
          drafts={drafts}
          projects={projects}
          readonly={readonly}
          onDraftChange={handleDraftChange}
        />
      ) : (
        <StandupCardView
          entries={visible}
          drafts={drafts}
          projects={projects}
          readonly={readonly}
          onDraftChange={handleDraftChange}
        />
      )}

      {!readonly && entries.length > 0 ? (
        <div className="mt-6 flex items-center gap-2 border-t pt-4">
          {miscNotesButton}
          {saveAllEndButton}
        </div>
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
