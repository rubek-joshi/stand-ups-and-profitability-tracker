import * as React from "react"
import {
  IconAlertOctagon,
  IconCheck,
  IconCornerDownRight,
  IconLoader2,
  IconPencil,
  IconSun,
  IconX,
} from "@tabler/icons-react"
import { cn } from "@workspace/ui/lib/utils"
import type { StandupTask, StandupTaskState } from "@/lib/types"

export type TaskDraft = {
  id: string
  text: string
  state: StandupTaskState
  blocker: string | null
}

export function emptyTask(): TaskDraft {
  return {
    id: crypto.randomUUID(),
    text: "",
    state: "open",
    blocker: null,
  }
}

export function tasksFromApi(tasks?: StandupTask[] | null): TaskDraft[] {
  return (tasks ?? []).map((task) => ({
    id: task.id,
    text: task.text,
    state: task.state,
    blocker: task.blocker,
  }))
}

function AutoTextarea({
  value,
  onChange,
  onKeyDown,
  className,
  placeholder,
  disabled,
  autoFocus,
  onBlur,
  "data-task": dataTask,
}: {
  value: string
  onChange: (v: string) => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  className?: string
  placeholder?: string
  disabled?: boolean
  autoFocus?: boolean
  onBlur?: () => void
  "data-task"?: boolean
}) {
  const ref = React.useRef<HTMLTextAreaElement>(null)
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = "0px"
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      disabled={disabled}
      autoFocus={autoFocus}
      placeholder={placeholder}
      onBlur={onBlur}
      data-task={dataTask ? "" : undefined}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      className={cn(
        "w-full resize-none overflow-hidden bg-transparent outline-none placeholder:text-muted-foreground/60 disabled:cursor-not-allowed",
        className,
      )}
    />
  )
}

const STATE_STYLES: Record<StandupTaskState, string> = {
  open: "text-foreground",
  done: "text-muted-foreground line-through decoration-muted-foreground/70",
  tomorrow: "text-task-tomorrow",
  progress: "text-task-progress",
}

const ACTIONS: Array<{
  state: StandupTaskState
  label: string
  icon: typeof IconCheck
}> = [
  { state: "done", label: "Completed", icon: IconCheck },
  { state: "tomorrow", label: "Move to tomorrow", icon: IconSun },
  { state: "progress", label: "In progress", icon: IconLoader2 },
]

export function TaskEditor({
  tasks,
  onChange,
  disabled = false,
  placeholder = "Write today's tasks — one per line",
}: {
  tasks: TaskDraft[]
  onChange: (tasks: TaskDraft[]) => void
  disabled?: boolean
  placeholder?: string
}) {
  const [editingBlocker, setEditingBlocker] = React.useState<string | null>(null)
  const [draft, setDraft] = React.useState("")
  const focusNext = React.useRef<number | null>(null)
  const rowsRef = React.useRef<HTMLDivElement>(null)
  const list = tasks.length ? tasks : []

  React.useEffect(() => {
    if (focusNext.current === null) return
    const idx = focusNext.current
    focusNext.current = null
    const el = rowsRef.current?.querySelectorAll<HTMLTextAreaElement>(
      "textarea[data-task]",
    )[idx]
    el?.focus()
    el?.setSelectionRange(el.value.length, el.value.length)
  }, [tasks])

  const patch = (id: string, next: Partial<TaskDraft>) =>
    onChange(list.map((t) => (t.id === id ? { ...t, ...next } : t)))

  const addAfter = (index: number) => {
    const next = [...list]
    next.splice(index + 1, 0, emptyTask())
    focusNext.current = index + 1
    onChange(next)
  }

  const removeAt = (index: number) => {
    const next = list.filter((_, i) => i !== index)
    focusNext.current = Math.max(0, index - 1)
    onChange(next)
  }

  const toggleState = (t: TaskDraft, state: StandupTaskState) =>
    patch(t.id, { state: t.state === state ? "open" : state })

  const saveBlocker = (t: TaskDraft) => {
    patch(t.id, { blocker: draft.trim() ? draft.trim() : null })
    setEditingBlocker(null)
    setDraft("")
  }

  return (
    <div ref={rowsRef} className={cn("group/editor space-y-0.5", disabled && "opacity-45")}>
      {list.length === 0 && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            focusNext.current = 0
            onChange([emptyTask()])
          }}
          className="w-full rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground/70 transition-colors hover:bg-accent/60 disabled:cursor-not-allowed disabled:hover:bg-transparent"
        >
          {placeholder}
        </button>
      )}

      {list.map((t, i) => (
        <div key={t.id}>
          <div className="group/task relative flex items-start gap-2 rounded-md px-2 py-1 transition-colors hover:bg-accent/50">
            <span
              aria-hidden
              className={cn(
                "mt-[0.55rem] size-1.5 shrink-0 rounded-full",
                t.state === "open" && "bg-muted-foreground/50",
                t.state === "done" && "bg-muted-foreground/30",
                t.state === "tomorrow" && "bg-task-tomorrow",
                t.state === "progress" && "bg-task-progress",
              )}
            />
            <AutoTextarea
              data-task
              value={t.text}
              disabled={disabled}
              placeholder="Task…"
              onChange={(v) => patch(t.id, { text: v })}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  addAfter(i)
                } else if (e.key === "Backspace" && t.text === "" && list.length > 1) {
                  e.preventDefault()
                  removeAt(i)
                }
              }}
              className={cn(
                "py-0.5 text-sm leading-6 transition-colors",
                STATE_STYLES[t.state],
                t.blocker && "decoration-task-blocker/60",
              )}
            />
            <div
              className={cn(
                "pointer-events-none absolute right-1.5 top-1 flex -translate-y-0.5 items-center gap-0.5 rounded-md border border-border bg-card p-0.5 opacity-0 shadow-sm transition-all",
                !disabled &&
                  "group-hover/task:pointer-events-auto group-hover/task:translate-y-0 group-hover/task:opacity-100 group-focus-within/task:pointer-events-auto group-focus-within/task:opacity-100",
              )}
            >
              {ACTIONS.map(({ state, label, icon: Icon }) => (
                <button
                  key={state}
                  type="button"
                  title={label}
                  aria-label={label}
                  onClick={() => toggleState(t, state)}
                  className={cn(
                    "rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                    t.state === state && "bg-accent text-foreground",
                  )}
                >
                  <Icon className="size-3.5" />
                </button>
              ))}
              <span className="mx-0.5 h-4 w-px bg-border" />
              <button
                type="button"
                title="Blocker"
                aria-label="Add blocker"
                onClick={() => {
                  setDraft(t.blocker ?? "")
                  setEditingBlocker(t.id)
                }}
                className={cn(
                  "rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-task-blocker",
                  t.blocker && "text-task-blocker",
                )}
              >
                <IconAlertOctagon className="size-3.5" />
              </button>
            </div>
          </div>

          {editingBlocker === t.id ? (
            <div className="ml-6 flex items-start gap-2 rounded-md border-l-2 border-task-blocker bg-task-blocker/5 px-2 py-1">
              <IconCornerDownRight className="mt-1 size-3.5 shrink-0 text-task-blocker" />
              <AutoTextarea
                autoFocus
                value={draft}
                onChange={setDraft}
                placeholder="What's blocking this? Enter to save"
                onBlur={() => saveBlocker(t)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    saveBlocker(t)
                  }
                  if (e.key === "Escape") {
                    setEditingBlocker(null)
                    setDraft("")
                  }
                }}
                className="py-0.5 text-[0.8rem] leading-5 text-task-blocker"
              />
            </div>
          ) : (
            t.blocker && (
              <div className="group/blocker relative ml-6 flex items-start gap-2 rounded-md border-l-2 border-task-blocker/50 bg-task-blocker/5 px-2 py-1 pr-14">
                <IconCornerDownRight className="mt-0.5 size-3.5 shrink-0 text-task-blocker/70" />
                <p className="text-[0.8rem] leading-5 text-task-blocker">{t.blocker}</p>
                <div className="pointer-events-none absolute right-1 top-0.5 flex items-center gap-0.5 rounded-md border border-border bg-card p-0.5 opacity-0 shadow-sm transition-opacity group-hover/blocker:pointer-events-auto group-hover/blocker:opacity-100">
                  <button
                    type="button"
                    title="Edit blocker"
                    aria-label="Edit blocker"
                    onClick={() => {
                      setDraft(t.blocker ?? "")
                      setEditingBlocker(t.id)
                    }}
                    className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <IconPencil className="size-3" />
                  </button>
                  <button
                    type="button"
                    title="Remove blocker"
                    aria-label="Remove blocker"
                    onClick={() => patch(t.id, { blocker: null })}
                    className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-task-blocker"
                  >
                    <IconX className="size-3" />
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      ))}

      {list.length > 0 && !disabled && (
        <button
          type="button"
          onClick={() => addAfter(list.length - 1)}
          className="ml-2 rounded px-1 py-0.5 text-xs text-muted-foreground/70 opacity-0 transition-opacity hover:text-foreground group-hover/editor:opacity-100"
        >
          + add line
        </button>
      )}
    </div>
  )
}
