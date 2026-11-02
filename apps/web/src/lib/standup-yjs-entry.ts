import * as Y from "yjs"
import type {
  AllocationDraft,
  EntryDraft,
} from "@/components/standup/entry-draft"
import type { TaskDraft } from "@/components/standup/task-editor"

/**
 * Flat per-field / per-task keys. Each device only writes the keys a user
 * actually edited, so devices working on different employees (or different
 * tasks of the same employee) never overwrite each other. Missing keys fall
 * back to the device's own draft (loaded from Postgres) — nothing is seeded.
 *
 * Keys: `${entryId}|status`, `|notes`, `|allocs`, `|updatedAt`,
 * `|order|${projectId}` (task id list), `|task|${taskId}` (task JSON).
 */
export const FIELDS_MAP_KEY = "entryFields"

/** Pre-flat-keys format (nested maps or whole-entry JSON). Read for migration only. */
export const LEGACY_ENTRIES_MAP_KEY = "entries"

/** Root map for stand-up-level fields shared over Yjs. */
export const META_MAP_KEY = "meta"
export const META_NOTES_KEY = "miscellaneousNotes"

/** Yjs transaction origins used for local/client writes — observers must ignore these. */
export const LOCAL_YJS_ORIGINS = new Set([
  "local-entry",
  "local-entry-updated-at",
  "local-meta",
  "legacy-migration",
])

export function isLocalYjsOrigin(origin: unknown): boolean {
  return typeof origin === "string" && LOCAL_YJS_ORIGINS.has(origin)
}

type AllocMeta = {
  projectId: string
  percentage: number
  isNonBillable: boolean
  locked: boolean
}

type TaskValue = {
  projectId: string
  text: string
  state: TaskDraft["state"]
  blocker: string | null
}

const fieldKey = (entryId: string, field: string) => `${entryId}|${field}`
const orderKey = (entryId: string, projectId: string) =>
  `${entryId}|order|${projectId}`
const taskKey = (entryId: string, taskId: string) =>
  `${entryId}|task|${taskId}`

/** Entry id a flat key belongs to. */
export function entryIdFromFieldKey(key: string): string {
  const index = key.indexOf("|")
  return index === -1 ? key : key.slice(0, index)
}

function parseJson<T>(raw: unknown): T | undefined {
  if (typeof raw !== "string") return undefined
  try {
    return JSON.parse(raw) as T
  } catch {
    return undefined
  }
}

function allocMeta(allocation: AllocationDraft): AllocMeta {
  return {
    projectId: allocation.projectId,
    percentage: Number(allocation.percentage),
    isNonBillable: Boolean(allocation.isNonBillable),
    locked: Boolean(allocation.locked),
  }
}

function taskValue(projectId: string, task: TaskDraft): TaskValue {
  return {
    projectId,
    text: task.text,
    state: task.state,
    blocker: task.blocker,
  }
}

function hasEntryKeys(map: Y.Map<unknown>, entryId: string): boolean {
  const prefix = `${entryId}|`
  for (const key of map.keys()) {
    if (key.startsWith(prefix)) return true
  }
  return false
}

/** Normalized form so `undefined` vs `false` etc. don't register as changes. */
export function serializeEntryFingerprint(draft: EntryDraft): string {
  return JSON.stringify({
    attendanceStatus: draft.attendanceStatus,
    miscellaneousNotes: draft.miscellaneousNotes,
    allocations: draft.allocations.map((allocation) => ({
      ...allocMeta(allocation),
      tasks: allocation.tasks.map((task) => ({
        id: task.id,
        text: task.text,
        state: task.state,
        blocker: task.blocker,
      })),
    })),
  })
}

/**
 * What the server would persist for this draft, ignoring task ids (the server
 * recreates tasks) and empty task rows (the server drops them).
 */
export function semanticEntryFingerprint(draft: EntryDraft): string {
  const absent = draft.attendanceStatus === "absent"
  return JSON.stringify({
    attendanceStatus: draft.attendanceStatus,
    miscellaneousNotes: absent ? "" : draft.miscellaneousNotes.trim(),
    allocations: absent
      ? []
      : draft.allocations
          .filter((allocation) => allocation.projectId)
          .map((allocation) => ({
            projectId: allocation.projectId,
            percentage: Number(allocation.percentage),
            isNonBillable: Boolean(allocation.isNonBillable),
            tasks: allocation.tasks
              .filter(
                (task) =>
                  task.text.trim().length > 0 ||
                  Boolean(task.blocker?.trim()) ||
                  task.state !== "open",
              )
              .map((task) => ({
                text: task.text,
                state: task.state,
                blocker: task.blocker?.trim() ? task.blocker : null,
              })),
          })),
  })
}

/** Resolve one entry from flat keys; anything not in Yjs comes from `fallback`. */
export function readEntryFromFields(
  map: Y.Map<unknown>,
  entryId: string,
  fallback: EntryDraft,
): EntryDraft {
  const status = map.get(fieldKey(entryId, "status"))
  const notes = map.get(fieldKey(entryId, "notes"))
  const allocs = parseJson<AllocMeta[]>(map.get(fieldKey(entryId, "allocs")))

  const yTasksByProject = new Map<string, Map<string, TaskDraft>>()
  const taskPrefix = `${entryId}|task|`
  for (const [key, raw] of map.entries()) {
    if (!key.startsWith(taskPrefix)) continue
    const value = parseJson<TaskValue>(raw)
    if (!value) continue
    const id = key.slice(taskPrefix.length)
    let bucket = yTasksByProject.get(value.projectId)
    if (!bucket) {
      bucket = new Map()
      yTasksByProject.set(value.projectId, bucket)
    }
    bucket.set(id, {
      id,
      text: value.text,
      state: value.state,
      blocker: value.blocker,
    })
  }

  const fallbackByProject = new Map(
    fallback.allocations.map((allocation) => [allocation.projectId, allocation]),
  )
  const baseAllocs: AllocMeta[] = Array.isArray(allocs)
    ? allocs
    : fallback.allocations.map(allocMeta)

  const allocations: AllocationDraft[] = baseAllocs.map((meta) => {
    const fallbackAlloc = fallbackByProject.get(meta.projectId)
    const fallbackTasks = fallbackAlloc?.tasks ?? []
    const order = parseJson<string[]>(
      map.get(orderKey(entryId, meta.projectId)),
    )
    const yTasks = yTasksByProject.get(meta.projectId)
    let tasks: TaskDraft[]
    if (!Array.isArray(order) && !yTasks) {
      tasks = fallbackTasks
    } else {
      const fallbackById = new Map(fallbackTasks.map((task) => [task.id, task]))
      const seen = new Set<string>()
      tasks = []
      for (const id of order ?? []) {
        const task = yTasks?.get(id) ?? fallbackById.get(id)
        if (!task || seen.has(id)) continue
        seen.add(id)
        tasks.push(task)
      }
      // Tasks added concurrently on another device may be missing from the
      // winning order list — append them rather than hide them.
      for (const [id, task] of yTasks ?? []) {
        if (seen.has(id)) continue
        seen.add(id)
        tasks.push(task)
      }
    }
    return { ...meta, tasks }
  })

  return {
    attendanceStatus:
      typeof status === "string"
        ? (status as EntryDraft["attendanceStatus"])
        : fallback.attendanceStatus,
    miscellaneousNotes:
      typeof notes === "string" ? notes : fallback.miscellaneousNotes,
    allocations,
  }
}

/**
 * Write only what differs between `prev` and `next`. Omitting `prev` writes
 * every field (used for legacy migration).
 */
export function writeEntryToYjs(
  map: Y.Map<unknown>,
  entryId: string,
  next: EntryDraft,
  prev?: EntryDraft,
): void {
  const apply = () => {
    if (!prev || prev.attendanceStatus !== next.attendanceStatus) {
      map.set(fieldKey(entryId, "status"), next.attendanceStatus)
    }
    if (!prev || prev.miscellaneousNotes !== next.miscellaneousNotes) {
      map.set(fieldKey(entryId, "notes"), next.miscellaneousNotes)
    }
    const nextAllocs = JSON.stringify(next.allocations.map(allocMeta))
    const prevAllocs = prev
      ? JSON.stringify(prev.allocations.map(allocMeta))
      : undefined
    if (nextAllocs !== prevAllocs) {
      map.set(fieldKey(entryId, "allocs"), nextAllocs)
    }

    const prevByProject = new Map(
      (prev?.allocations ?? []).map((allocation) => [
        allocation.projectId,
        allocation,
      ]),
    )
    const prevTaskById = new Map<string, TaskValue>()
    for (const allocation of prev?.allocations ?? []) {
      for (const task of allocation.tasks) {
        prevTaskById.set(task.id, taskValue(allocation.projectId, task))
      }
    }
    const nextTaskIds = new Set<string>()

    for (const allocation of next.allocations) {
      const ids = allocation.tasks.map((task) => task.id)
      const prevIds = prevByProject
        .get(allocation.projectId)
        ?.tasks.map((task) => task.id)
      if (!prevIds || JSON.stringify(prevIds) !== JSON.stringify(ids)) {
        map.set(orderKey(entryId, allocation.projectId), JSON.stringify(ids))
      }
      for (const task of allocation.tasks) {
        nextTaskIds.add(task.id)
        const value = JSON.stringify(taskValue(allocation.projectId, task))
        const before = prevTaskById.get(task.id)
        if (!before || JSON.stringify(before) !== value) {
          map.set(taskKey(entryId, task.id), value)
        }
      }
    }

    for (const id of prevTaskById.keys()) {
      if (!nextTaskIds.has(id)) map.delete(taskKey(entryId, id))
    }
    const nextProjectIds = new Set(
      next.allocations.map((allocation) => allocation.projectId),
    )
    for (const projectId of prevByProject.keys()) {
      if (!nextProjectIds.has(projectId)) {
        map.delete(orderKey(entryId, projectId))
      }
    }
  }
  const doc = map.doc
  if (doc) {
    doc.transact(apply, "local-entry")
  } else {
    apply()
  }
}

/** Persist DB updatedAt into Yjs so peers' optimistic locks stay current after a save. */
export function writeEntryUpdatedAt(
  map: Y.Map<unknown>,
  entryId: string,
  updatedAt: string,
): void {
  const key = fieldKey(entryId, "updatedAt")
  if (map.get(key) === updatedAt) return
  const doc = map.doc
  if (doc) {
    doc.transact(() => map.set(key, updatedAt), "local-entry-updated-at")
  } else {
    map.set(key, updatedAt)
  }
}

/** Collect entryId → updatedAt from Yjs. */
export function collectEntryUpdatedAts(
  map: Y.Map<unknown>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, raw] of map.entries()) {
    if (!key.endsWith("|updatedAt")) continue
    if (typeof raw === "string" && raw.length > 0) {
      out[entryIdFromFieldKey(key)] = raw
    }
  }
  return out
}

function parseLegacyEntry(raw: unknown, fallback: EntryDraft): EntryDraft {
  if (typeof raw === "string") {
    const parsed = parseJson<Partial<EntryDraft>>(raw)
    if (!parsed) return fallback
    return {
      attendanceStatus: parsed.attendanceStatus ?? fallback.attendanceStatus,
      miscellaneousNotes:
        typeof parsed.miscellaneousNotes === "string"
          ? parsed.miscellaneousNotes
          : fallback.miscellaneousNotes,
      allocations: Array.isArray(parsed.allocations)
        ? parsed.allocations.map((allocation) => ({
            projectId: allocation.projectId,
            percentage: allocation.percentage,
            isNonBillable: allocation.isNonBillable,
            locked: Boolean(allocation.locked),
            tasks: Array.isArray(allocation.tasks) ? allocation.tasks : [],
          }))
        : fallback.allocations,
    }
  }
  if (raw instanceof Y.Map) {
    const status = raw.get("attendanceStatus")
    const notes = raw.get("miscellaneousNotes")
    const allocations = parseJson<EntryDraft["allocations"]>(
      raw.get("allocations"),
    )
    return {
      attendanceStatus:
        typeof status === "string"
          ? (status as EntryDraft["attendanceStatus"])
          : fallback.attendanceStatus,
      miscellaneousNotes:
        typeof notes === "string" ? notes : fallback.miscellaneousNotes,
      allocations: Array.isArray(allocations)
        ? allocations
        : fallback.allocations,
    }
  }
  return fallback
}

/**
 * Copy unsaved drafts from the old `entries` map into flat keys, for entries
 * that have no flat keys yet. Returns migrated entry ids.
 */
export function migrateLegacyEntries(
  doc: Y.Doc,
  drafts: Record<string, EntryDraft>,
): string[] {
  const legacy = doc.getMap<unknown>(LEGACY_ENTRIES_MAP_KEY)
  const fields = doc.getMap<unknown>(FIELDS_MAP_KEY)
  const migrated: string[] = []
  doc.transact(() => {
    for (const [entryId, raw] of legacy.entries()) {
      const fallback = drafts[entryId]
      if (!fallback || hasEntryKeys(fields, entryId)) continue
      const draft = parseLegacyEntry(raw, fallback)
      if (
        serializeEntryFingerprint(draft) === serializeEntryFingerprint(fallback)
      ) {
        continue
      }
      writeEntryToYjs(fields, entryId, draft, fallback)
      migrated.push(entryId)
    }
  }, "legacy-migration")
  return migrated
}

export type EntryDraftSummary = {
  attendanceStatus: EntryDraft["attendanceStatus"]
  notesLength: number
  notesPreview: string
  allocationCount: number
  projectIds: string[]
  taskCount: number
  taskTexts: string[]
}

export type EntryMergeChange = {
  entryId: string
  before: EntryDraftSummary
  after: EntryDraftSummary
}

function previewText(value: string, max = 80): string {
  const trimmed = value.replace(/\s+/g, " ").trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max)}…`
}

export function summarizeEntryDraft(draft: EntryDraft): EntryDraftSummary {
  const tasks = draft.allocations.flatMap((allocation) => allocation.tasks)
  return {
    attendanceStatus: draft.attendanceStatus,
    notesLength: draft.miscellaneousNotes.length,
    notesPreview: previewText(draft.miscellaneousNotes),
    allocationCount: draft.allocations.length,
    projectIds: draft.allocations.map((allocation) => allocation.projectId),
    taskCount: tasks.length,
    taskTexts: tasks.map((task) => previewText(task.text, 40)),
  }
}

/**
 * Pull Yjs into React drafts. Pass `onlyEntryIds` (from the keys a remote
 * update touched) so unrelated entries are never re-derived.
 */
export function mergeYjsEntriesIntoDrafts(
  map: Y.Map<unknown>,
  drafts: Record<string, EntryDraft>,
  onlyEntryIds?: Iterable<string>,
): {
  drafts: Record<string, EntryDraft>
  changed: boolean
  changes: EntryMergeChange[]
} {
  const next = { ...drafts }
  const changes: EntryMergeChange[] = []
  for (const entryId of onlyEntryIds ?? Object.keys(drafts)) {
    const before = next[entryId]
    if (!before) continue
    const merged = readEntryFromFields(map, entryId, before)
    if (
      serializeEntryFingerprint(merged) === serializeEntryFingerprint(before)
    ) {
      continue
    }
    next[entryId] = merged
    changes.push({
      entryId,
      before: summarizeEntryDraft(before),
      after: summarizeEntryDraft(merged),
    })
  }
  return { drafts: next, changed: changes.length > 0, changes }
}

/** Browser console dump for stand-up collab merges (hydrate / remote sync). */
export function logStandupMerge(
  source: string,
  details: {
    standupId?: string
    origin?: unknown
    peerCount?: number
    locallyDirtyIds?: string[]
    touchedEntryIds?: string[]
    changes: EntryMergeChange[]
    notes?: {
      before: string
      after: string
      source: "yjs" | "local-dirty-keep"
    }
    appliedToReact?: boolean
    extra?: Record<string, unknown>
  },
): void {
  if (typeof console === "undefined") return
  const { changes, notes, ...rest } = details
  if (changes.length === 0 && !notes) return
  console.groupCollapsed(
    `[standup-collab] merge · ${source} · ${changes.length} entr${
      changes.length === 1 ? "y" : "ies"
    }${notes ? " + notes" : ""}`,
  )
  console.log("context", rest)
  if (notes) {
    console.log("stand-up notes", {
      source: notes.source,
      beforePreview: previewText(notes.before),
      afterPreview: previewText(notes.after),
      beforeLength: notes.before.length,
      afterLength: notes.after.length,
    })
  }
  for (const change of changes) {
    console.log(change.entryId, {
      before: change.before,
      after: change.after,
      clearedTasks:
        change.before.taskCount > 0 && change.after.taskCount === 0,
      clearedNotes:
        change.before.notesLength > 0 && change.after.notesLength === 0,
      clearedAllocations:
        change.before.allocationCount > 0 &&
        change.after.allocationCount === 0,
    })
  }
  console.groupEnd()
}

export function readMetaNotes(doc: Y.Doc): string | undefined {
  const meta = doc.getMap<unknown>(META_MAP_KEY)
  const notes = meta.get(META_NOTES_KEY)
  return typeof notes === "string" ? notes : undefined
}

export function writeMetaNotes(doc: Y.Doc, notes: string): void {
  const meta = doc.getMap<unknown>(META_MAP_KEY)
  if (meta.get(META_NOTES_KEY) === notes) return
  doc.transact(() => {
    meta.set(META_NOTES_KEY, notes)
  }, "local-meta")
}
