import * as Y from "yjs"
import type { EntryDraft } from "@/components/standup/entry-draft"

/** Root map holding per-entry collab state (nested maps or legacy JSON strings). */
export const ENTRIES_MAP_KEY = "entries"

/** Root map for stand-up-level fields shared over Yjs. */
export const META_MAP_KEY = "meta"
export const META_NOTES_KEY = "miscellaneousNotes"

/** Yjs transaction origins used for local/client writes — observers must ignore these. */
export const LOCAL_YJS_ORIGINS = new Set([
  "local-entry",
  "local-entry-updated-at",
  "local-meta",
  "hydrate-meta",
])

export function isLocalYjsOrigin(origin: unknown): boolean {
  return typeof origin === "string" && LOCAL_YJS_ORIGINS.has(origin)
}

function allocationsJson(draft: EntryDraft): string {
  return JSON.stringify(draft.allocations)
}

function parseLegacyEntry(raw: string, fallback: EntryDraft): EntryDraft {
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

/** Read one entry from Yjs (supports legacy whole-JSON strings and field maps). */
export function readEntryFromYjs(
  raw: unknown,
  fallback: EntryDraft,
): EntryDraft {
  if (typeof raw === "string") {
    return parseLegacyEntry(raw, fallback)
  }
  if (raw instanceof Y.Map) {
    const notes = raw.get("miscellaneousNotes")
    const status = raw.get("attendanceStatus")
    const allocationsRaw = raw.get("allocations")
    let allocations = fallback.allocations
    if (typeof allocationsRaw === "string") {
      try {
        const parsed = JSON.parse(allocationsRaw) as EntryDraft["allocations"]
        if (Array.isArray(parsed)) allocations = parsed
      } catch {
        /* keep fallback */
      }
    }
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
  return fallback
}

export function serializeEntryFingerprint(draft: EntryDraft): string {
  return JSON.stringify({
    miscellaneousNotes: draft.miscellaneousNotes,
    attendanceStatus: draft.attendanceStatus,
    allocations: draft.allocations,
  })
}

/**
 * Write entry fields into a nested Y.Map so concurrent edits to notes vs
 * attendance vs allocations merge instead of last-write-wins on the whole entry.
 */
export function writeEntryToYjs(
  map: Y.Map<unknown>,
  entryId: string,
  draft: EntryDraft,
): void {
  const apply = () => {
    let entry = map.get(entryId)
    // Migrate legacy whole-JSON strings to nested field maps.
    if (!(entry instanceof Y.Map)) {
      entry = new Y.Map<unknown>()
      map.set(entryId, entry)
    }
    const entryMap = entry as Y.Map<unknown>
    if (entryMap.get("miscellaneousNotes") !== draft.miscellaneousNotes) {
      entryMap.set("miscellaneousNotes", draft.miscellaneousNotes)
    }
    if (entryMap.get("attendanceStatus") !== draft.attendanceStatus) {
      entryMap.set("attendanceStatus", draft.attendanceStatus)
    }
    const nextAlloc = allocationsJson(draft)
    if (entryMap.get("allocations") !== nextAlloc) {
      entryMap.set("allocations", nextAlloc)
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
  const apply = () => {
    const entry = map.get(entryId)
    // Only annotate nested field maps — never replace a legacy JSON string.
    if (!(entry instanceof Y.Map)) return
    if (entry.get("updatedAt") !== updatedAt) {
      entry.set("updatedAt", updatedAt)
    }
  }
  const doc = map.doc
  if (doc) {
    doc.transact(apply, "local-entry-updated-at")
  } else {
    apply()
  }
}

export function readEntryUpdatedAt(raw: unknown): string | undefined {
  if (!(raw instanceof Y.Map)) return undefined
  const value = raw.get("updatedAt")
  return typeof value === "string" && value.length > 0 ? value : undefined
}

/** Collect entryId → updatedAt from Yjs (nested maps only). */
export function collectEntryUpdatedAts(
  map: Y.Map<unknown>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [entryId, raw] of map.entries()) {
    const at = readEntryUpdatedAt(raw)
    if (at) out[entryId] = at
  }
  return out
}

/** Seed only keys that are missing from Yjs — never wipe existing collab state. */
export function seedMissingEntriesIntoYjs(
  map: Y.Map<unknown>,
  drafts: Record<string, EntryDraft>,
): void {
  for (const [entryId, draft] of Object.entries(drafts)) {
    if (map.has(entryId)) continue
    writeEntryToYjs(map, entryId, draft)
  }
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

export function mergeYjsEntriesIntoDrafts(
  map: Y.Map<unknown>,
  drafts: Record<string, EntryDraft>,
): {
  drafts: Record<string, EntryDraft>
  changed: boolean
  changes: EntryMergeChange[]
} {
  const next = { ...drafts }
  const changes: EntryMergeChange[] = []
  for (const [entryId, raw] of map.entries()) {
    if (!next[entryId]) continue
    const before = next[entryId]!
    const merged = readEntryFromYjs(raw, before)
    if (
      serializeEntryFingerprint(merged) ===
      serializeEntryFingerprint(before)
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

export function seedMetaNotesIfMissing(doc: Y.Doc, notes: string): void {
  const meta = doc.getMap<unknown>(META_MAP_KEY)
  if (meta.has(META_NOTES_KEY)) return
  doc.transact(() => {
    meta.set(META_NOTES_KEY, notes)
  }, "hydrate-meta")
}
