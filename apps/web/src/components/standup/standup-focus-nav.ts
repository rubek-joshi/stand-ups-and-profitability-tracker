import { focusStandupNotes } from "./markdown-notes"
import { openMiscellaneousNotes } from "./miscellaneous-notes-toggle"
import { isWorking, type EntryDraft } from "./entry-draft"

export type StandupFocusStop =
  | { type: "project"; entryId: string; projectId: string }
  | { type: "misc"; entryId: string }

export function buildStandupFocusStops(
  entries: Array<{ id: string }>,
  drafts: Record<string, EntryDraft>,
): StandupFocusStop[] {
  const stops: StandupFocusStop[] = []
  for (const entry of entries) {
    const draft = drafts[entry.id]
    if (!draft || !isWorking(draft.attendanceStatus)) continue
    if (draft.allocations.length === 0) {
      stops.push({ type: "misc", entryId: entry.id })
      continue
    }
    for (const allocation of draft.allocations) {
      stops.push({
        type: "project",
        entryId: entry.id,
        projectId: allocation.projectId,
      })
    }
  }
  return stops
}

function escapeAttr(value: string) {
  return CSS.escape(value)
}

export function focusStandupProject(entryId: string, projectId: string) {
  const entry = document.querySelector(
    `[data-standup-entry="${escapeAttr(entryId)}"]`,
  )
  const project = entry?.querySelector(
    `[data-standup-project="${escapeAttr(projectId)}"]`,
  )
  if (!(project instanceof HTMLElement)) return

  project.scrollIntoView({ block: "center", behavior: "smooth" })

  const task = project.querySelector<HTMLTextAreaElement>("textarea[data-task]")
  if (task) {
    task.focus()
    const len = task.value.length
    task.setSelectionRange(len, len)
    return
  }

  const empty = project.querySelector<HTMLButtonElement>(
    "[data-standup-empty-tasks]",
  )
  empty?.click()
}

export function focusStandupStop(stop: StandupFocusStop) {
  if (stop.type === "project") {
    focusStandupProject(stop.entryId, stop.projectId)
    return
  }

  const entry = document.querySelector(
    `[data-standup-entry="${escapeAttr(stop.entryId)}"]`,
  )
  entry?.scrollIntoView({ block: "center", behavior: "smooth" })
  openMiscellaneousNotes(stop.entryId)

  let attempts = 0
  const tryFocus = () => {
    if (focusStandupNotes(stop.entryId)) return
    attempts += 1
    if (attempts < 10) {
      window.setTimeout(tryFocus, 40)
    }
  }
  window.setTimeout(tryFocus, 40)
}

function findCurrentStopIndex(
  stops: StandupFocusStop[],
  target: EventTarget | null,
): number {
  if (!(target instanceof Element) || stops.length === 0) return -1

  const entryEl = target.closest<HTMLElement>("[data-standup-entry]")
  if (!entryEl) return -1
  const entryId = entryEl.getAttribute("data-standup-entry")
  if (!entryId) return -1

  const projectEl = target.closest<HTMLElement>("[data-standup-project]")
  if (projectEl) {
    const projectId = projectEl.getAttribute("data-standup-project")
    if (projectId) {
      return stops.findIndex(
        (stop) =>
          stop.type === "project" &&
          stop.entryId === entryId &&
          stop.projectId === projectId,
      )
    }
  }

  const inNotes =
    Boolean(target.closest("[data-standup-notes]")) ||
    Boolean(target.closest("[data-standup-misc]"))
  if (inNotes) {
    const miscIndex = stops.findIndex(
      (stop) => stop.type === "misc" && stop.entryId === entryId,
    )
    if (miscIndex >= 0) return miscIndex

    let lastForEntry = -1
    for (let i = 0; i < stops.length; i++) {
      if (stops[i]!.entryId === entryId) lastForEntry = i
    }
    return lastForEntry
  }

  return stops.findIndex((stop) => stop.entryId === entryId)
}

/** Advance focus to the next project / employee stop. Returns false when already at the end. */
export function advanceStandupFocus(
  entries: Array<{ id: string }>,
  drafts: Record<string, EntryDraft>,
  target: EventTarget | null,
): boolean {
  const stops = buildStandupFocusStops(entries, drafts)
  if (stops.length === 0) return false

  const current = findCurrentStopIndex(stops, target)
  const nextIndex = current < 0 ? 0 : current + 1
  if (nextIndex >= stops.length) return false

  focusStandupStop(stops[nextIndex]!)
  return true
}
