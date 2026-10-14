import * as Y from "yjs"
import type { EntryDraft } from "@/components/standup/entry-draft"

/** Root map holding per-entry collab state (nested maps or legacy JSON strings). */
export const ENTRIES_MAP_KEY = "entries"

/** Root map for stand-up-level fields shared over Yjs. */
export const META_MAP_KEY = "meta"
export const META_NOTES_KEY = "miscellaneousNotes"

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

export function mergeYjsEntriesIntoDrafts(
  map: Y.Map<unknown>,
  drafts: Record<string, EntryDraft>,
): { drafts: Record<string, EntryDraft>; changed: boolean } {
  const next = { ...drafts }
  let changed = false
  for (const [entryId, raw] of map.entries()) {
    if (!next[entryId]) continue
    const merged = readEntryFromYjs(raw, next[entryId]!)
    if (
      serializeEntryFingerprint(merged) ===
      serializeEntryFingerprint(next[entryId]!)
    ) {
      continue
    }
    next[entryId] = merged
    changed = true
  }
  return { drafts: next, changed }
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
