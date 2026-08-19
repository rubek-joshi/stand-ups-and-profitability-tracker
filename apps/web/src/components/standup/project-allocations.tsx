import * as React from "react"
import { IconCheck, IconLock, IconLockOpen, IconRotate, IconX } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { Input } from "@workspace/ui/components/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { Slider } from "@workspace/ui/components/slider"
import { cn } from "@workspace/ui/lib/utils"
import type { Project } from "@/lib/types"

export type DraftAlloc = {
  projectId: string
  percentage: number
  isNonBillable?: boolean
  locked?: boolean
}

type Props = {
  allocations: DraftAlloc[]
  projects: Project[]
  disabled?: boolean
  onChange: (allocations: DraftAlloc[]) => void
}

const barColors = [
  "bg-primary",
  "bg-primary/70",
  "bg-primary/45",
  "bg-foreground/35",
  "bg-foreground/20",
  "bg-muted-foreground/40",
]

const MIN_ALLOCATION = 1

function pct(allocation: DraftAlloc) {
  return Number(allocation.percentage) || 0
}

export function totalPercent(allocations: DraftAlloc[]) {
  return allocations.reduce((sum, a) => sum + pct(a), 0)
}

export function maxPercentFor(allocations: DraftAlloc[], projectId: string) {
  let reserved = 0
  for (const allocation of allocations) {
    if (allocation.projectId === projectId) continue
    reserved += allocation.locked ? pct(allocation) : MIN_ALLOCATION
  }
  return Math.max(MIN_ALLOCATION, 100 - reserved)
}

export function rebalance(allocations: DraftAlloc[]): DraftAlloc[] {
  if (allocations.length === 0) return []
  const unlocked = allocations.filter((a) => !a.locked)
  const lockedTotal = allocations
    .filter((a) => a.locked)
    .reduce((sum, a) => sum + pct(a), 0)
  const remaining = Math.max(0, 100 - lockedTotal)
  if (unlocked.length === 0) return allocations
  if (remaining < unlocked.length * MIN_ALLOCATION) return allocations

  const base = Math.floor(remaining / unlocked.length)
  let leftover = remaining - base * unlocked.length
  return allocations.map((a) => {
    if (a.locked) return a
    const extra = leftover > 0 ? 1 : 0
    leftover -= extra
    return { ...a, percentage: base + extra }
  })
}

function takeFromUnlocked(
  allocations: DraftAlloc[],
  amount: number,
  exceptId?: string,
): { allocations: DraftAlloc[]; taken: number } {
  if (amount <= 0) return { allocations, taken: 0 }

  const percents = new Map(allocations.map((a) => [a.projectId, pct(a)]))
  const donorIds = allocations
    .filter((a) => !a.locked && a.projectId !== exceptId)
    .map((a) => a.projectId)

  let taken = 0
  while (taken < amount) {
    const donors = donorIds
      .filter((id) => (percents.get(id) ?? 0) > MIN_ALLOCATION)
      .sort((a, b) => (percents.get(b) ?? 0) - (percents.get(a) ?? 0) || a.localeCompare(b))
    if (donors.length === 0) break
    const donor = donors[0]!
    percents.set(donor, (percents.get(donor) ?? 0) - 1)
    taken += 1
  }

  return {
    taken,
    allocations: allocations.map((a) => ({
      ...a,
      percentage: percents.get(a.projectId) ?? pct(a),
    })),
  }
}

export function setAllocationPercent(
  allocations: DraftAlloc[],
  projectId: string,
  percent: number,
): DraftAlloc[] {
  const current = allocations.find((a) => a.projectId === projectId)
  if (!current) return allocations

  const from = pct(current)
  const raw = Number(percent)
  const desired = Math.max(
    MIN_ALLOCATION,
    Math.min(
      maxPercentFor(allocations, projectId),
      Number.isFinite(raw) ? Math.round(raw) : from,
    ),
  )

  if (desired <= from) {
    return allocations.map((a) =>
      a.projectId === projectId ? { ...a, percentage: desired } : a,
    )
  }

  const unallocated = Math.max(0, 100 - totalPercent(allocations))
  const want = desired - from
  const fromPool = Math.min(want, unallocated)
  const raised = allocations.map((a) =>
    a.projectId === projectId ? { ...a, percentage: from + fromPool } : a,
  )
  const { allocations: stolen, taken } = takeFromUnlocked(
    raised,
    want - fromPool,
    projectId,
  )
  return stolen.map((a) =>
    a.projectId === projectId
      ? { ...a, percentage: from + fromPool + taken }
      : a,
  )
}

function canAddProject(allocations: DraftAlloc[]) {
  const unlockedCount = allocations.filter((a) => !a.locked).length + 1
  const lockedTotal = allocations
    .filter((a) => a.locked)
    .reduce((sum, a) => sum + pct(a), 0)
  const remaining = Math.max(0, 100 - lockedTotal)
  if (remaining >= unlockedCount * MIN_ALLOCATION) return true
  return allocations.some((a) => !a.locked && pct(a) > MIN_ALLOCATION)
}

function addProject(allocations: DraftAlloc[], projectId: string): DraftAlloc[] {
  const next = [...allocations, { projectId, percentage: MIN_ALLOCATION, locked: false }]
  const unlockedCount = next.filter((a) => !a.locked).length
  const lockedTotal = next.filter((a) => a.locked).reduce((sum, a) => sum + pct(a), 0)
  const remaining = Math.max(0, 100 - lockedTotal)
  if (unlockedCount > 0 && remaining >= unlockedCount * MIN_ALLOCATION) {
    return rebalance(next)
  }
  const { allocations: reduced, taken } = takeFromUnlocked(allocations, MIN_ALLOCATION)
  if (taken < MIN_ALLOCATION) return allocations
  return [...reduced, { projectId, percentage: MIN_ALLOCATION, locked: false }]
}

export function ProjectAllocations({
  allocations,
  projects,
  disabled,
  onChange,
}: Props) {
  const total = totalPercent(allocations)
  const selectedIds = new Set(allocations.map((a) => a.projectId))
  const projectById = React.useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects],
  )

  const toggleProject = (projectId: string) => {
    if (selectedIds.has(projectId)) {
      onChange(rebalance(allocations.filter((a) => a.projectId !== projectId)))
      return
    }
    onChange(addProject(allocations, projectId))
  }

  return (
    <div className={cn("space-y-3", disabled && "pointer-events-none opacity-50")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Projects
        </span>
        <Badge
          variant="outline"
          className={cn(
            "font-mono text-[11px]",
            allocations.length === 0
              ? "text-muted-foreground"
              : total === 100
                ? "border-emerald-600/30 text-emerald-700 dark:text-emerald-400"
                : total > 100
                  ? "border-destructive/40 text-destructive"
                  : "border-amber-600/30 text-amber-700 dark:text-amber-400",
          )}
        >
          {allocations.length === 0
            ? "none selected"
            : total > 100
              ? `${total}% (over)`
              : total < 100
                ? `${total}% · ${100 - total}% unallocated`
                : `${total}% allocated`}
        </Badge>
        {allocations.some((a) => a.locked) ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-1.5 text-[11px]"
            onClick={() =>
              onChange(rebalance(allocations.map((a) => ({ ...a, locked: false }))))
            }
          >
            <IconRotate className="size-3" />
            Split evenly
          </Button>
        ) : null}
      </div>

      <Popover>
        <PopoverTrigger
          disabled={disabled}
          className={cn(
            "flex w-full rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-left text-sm text-muted-foreground transition-colors",
            "hover:border-primary/50 hover:text-foreground",
            "disabled:pointer-events-none disabled:opacity-50",
          )}
        >
          {allocations.length === 0
            ? "Select projects…"
            : `${allocations.length} project${allocations.length > 1 ? "s" : ""} · click to change`}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 gap-0 p-1.5">
          <div className="max-h-64 space-y-0.5 overflow-y-auto">
            {projects.length === 0 ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">No projects available</p>
            ) : (
              projects.map((project) => {
                const active = selectedIds.has(project.id)
                const canSelect = active || canAddProject(allocations)
                return (
                  <button
                    key={project.id}
                    type="button"
                    disabled={!canSelect}
                    onClick={() => toggleProject(project.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted",
                      active && "bg-muted",
                      !canSelect && "cursor-not-allowed opacity-50",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-4 items-center justify-center rounded border",
                        active && "border-primary bg-primary text-primary-foreground",
                      )}
                    >
                      {active ? <IconCheck className="size-3" /> : null}
                    </span>
                    <span className="truncate">{project.name}</span>
                  </button>
                )
              })
            )}
          </div>
        </PopoverContent>
      </Popover>

      {allocations.length > 0 ? (
        <>
          <div className="flex h-2 overflow-hidden rounded-full bg-muted">
            {allocations.map((a, i) => (
              <div
                key={a.projectId}
                className={cn("h-full transition-all", barColors[i % barColors.length])}
                style={{ width: `${Math.max(0, a.percentage)}%` }}
              />
            ))}
          </div>

          <div className="space-y-2.5">
            {allocations.map((a, i) => {
              const project = projectById.get(a.projectId)
              return (
                <div key={a.projectId} className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      barColors[i % barColors.length],
                    )}
                  />
                  <span className="w-28 shrink-0 truncate text-sm sm:w-32">
                    {project?.name ?? a.projectId}
                  </span>
                  <Slider
                    value={[a.percentage]}
                    min={0}
                    max={100}
                    disabled={disabled}
                    className="flex-1"
                    onValueChange={(value) => {
                      const next = Array.isArray(value) ? value[0] : value
                      onChange(
                        setAllocationPercent(allocations, a.projectId, Number(next) || 0),
                      )
                    }}
                  />
                  <Input
                    type="number"
                    min={MIN_ALLOCATION}
                    max={100}
                    disabled={disabled}
                    value={a.percentage}
                    onChange={(e) =>
                      onChange(
                        setAllocationPercent(
                          allocations,
                          a.projectId,
                          Number(e.target.value),
                        ),
                      )
                    }
                    className="h-8 w-16 text-center font-mono text-xs"
                  />
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    disabled={disabled}
                    title={a.locked ? "Unlock this percentage" : "Lock this percentage"}
                    className={cn(a.locked && "text-primary")}
                    onClick={() =>
                      onChange(
                        allocations.map((x) =>
                          x.projectId === a.projectId
                            ? { ...x, locked: !x.locked }
                            : x,
                        ),
                      )
                    }
                  >
                    {a.locked ? (
                      <IconLock className="size-3.5" />
                    ) : (
                      <IconLockOpen className="size-3.5" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    disabled={disabled}
                    title="Remove project"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => toggleProject(a.projectId)}
                  >
                    <IconX className="size-3.5" />
                  </Button>
                </div>
              )
            })}
          </div>
        </>
      ) : null}
    </div>
  )
}
