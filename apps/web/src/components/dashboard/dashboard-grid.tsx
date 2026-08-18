import * as React from "react"
import {
  IconEye,
  IconEyeOff,
  IconGripVertical,
  IconMaximize,
  IconMinimize,
  IconRotateClockwise,
} from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { cn } from "@workspace/ui/lib/utils"
import { getCardDefs, type CardWidth } from "@/components/dashboard/cards"
import type { DashboardData } from "@/lib/dashboard-metrics"

const STORAGE_KEY = "ops-dashboard-layout-v2"

const WIDTHS: CardWidth[] = ["sm", "md", "lg", "xl"]

const SPAN: Record<CardWidth, string> = {
  sm: "md:col-span-3",
  md: "md:col-span-6",
  lg: "md:col-span-8",
  xl: "md:col-span-12",
}

interface LayoutItem {
  id: string
  width: CardWidth
  hidden?: boolean
}

function defaultLayout(defs: ReturnType<typeof getCardDefs>): LayoutItem[] {
  return defs.map((c) => ({ id: c.id, width: c.defaultWidth, hidden: false }))
}

function loadLayout(defs: ReturnType<typeof getCardDefs>): LayoutItem[] {
  if (typeof window === "undefined") return defaultLayout(defs)
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultLayout(defs)
    const parsed = JSON.parse(raw) as LayoutItem[]
    const known = new Map(defaultLayout(defs).map((i) => [i.id, i]))
    const merged = parsed.filter((i) => known.has(i.id))
    for (const item of known.values()) {
      if (!merged.some((m) => m.id === item.id)) merged.push(item)
    }
    return merged
  } catch {
    return defaultLayout(defs)
  }
}

export function DashboardGrid({
  data,
  editing,
  onEditingChange,
}: {
  data: DashboardData
  editing: boolean
  onEditingChange: (v: boolean) => void
}) {
  const defs = React.useMemo(() => getCardDefs(data.canViewAudit), [data.canViewAudit])
  const defMap = React.useMemo(() => new Map(defs.map((c) => [c.id, c])), [defs])

  const [layout, setLayout] = React.useState<LayoutItem[]>(() => defaultLayout(defs))
  const [dragId, setDragId] = React.useState<string | null>(null)
  const hydrated = React.useRef(false)

  React.useEffect(() => {
    setLayout(loadLayout(defs))
    hydrated.current = true
  }, [defs])

  React.useEffect(() => {
    if (!hydrated.current) return
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout))
  }, [layout])

  const visibleLayout = layout.filter((item) => !item.hidden && defMap.has(item.id))
  const hiddenLayout = layout.filter((item) => item.hidden && defMap.has(item.id))

  const moveCard = (from: string, to: string) => {
    if (from === to) return
    setLayout((prev) => {
      const next = [...prev]
      const fromIndex = next.findIndex((i) => i.id === from)
      const toIndex = next.findIndex((i) => i.id === to)
      if (fromIndex < 0 || toIndex < 0) return prev
      const [moved] = next.splice(fromIndex, 1)
      if (!moved) return prev
      next.splice(toIndex, 0, moved)
      return next
    })
  }

  const cycleWidth = (id: string, dir: 1 | -1) =>
    setLayout((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item
        const idx = WIDTHS.indexOf(item.width)
        const nextIdx = Math.min(WIDTHS.length - 1, Math.max(0, idx + dir))
        return { ...item, width: WIDTHS[nextIdx] ?? item.width }
      }),
    )

  const setHidden = (id: string, hidden: boolean) =>
    setLayout((prev) =>
      prev.map((item) => (item.id === id ? { ...item, hidden } : item)),
    )

  const renderPanel = (item: LayoutItem, hiddenSection = false) => {
    const def = defMap.get(item.id)
    if (!def) return null

    return (
      <Card
        key={item.id}
        draggable={editing && !hiddenSection}
        onDragStart={() => setDragId(item.id)}
        onDragEnd={() => setDragId(null)}
        onDragOver={(e) => {
          if (!editing || !dragId || hiddenSection) return
          e.preventDefault()
          moveCard(dragId, item.id)
        }}
        className={cn(
          "relative transition-all",
          SPAN[item.width],
          editing && !hiddenSection && "cursor-grab ring-1 ring-primary/25",
          dragId === item.id && "opacity-50",
          hiddenSection && "opacity-80",
        )}
      >
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
          <div className="min-w-0">
            <CardTitle className="truncate text-sm font-semibold tracking-tight">
              {def.title}
            </CardTitle>
            {def.subtitle ? (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{def.subtitle}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {!editing && def.viewAll ? def.viewAll : null}
            {editing ? (
              !hiddenSection ? (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label={`Shrink ${def.title}`}
                    onClick={() => cycleWidth(item.id, -1)}
                  >
                    <IconMinimize className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label={`Widen ${def.title}`}
                    onClick={() => cycleWidth(item.id, 1)}
                  >
                    <IconMaximize className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label={`Hide ${def.title}`}
                    onClick={() => setHidden(item.id, true)}
                  >
                    <IconEyeOff className="size-3.5" />
                  </Button>
                  <IconGripVertical className="size-4 text-muted-foreground" />
                </>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label={`Show ${def.title}`}
                  onClick={() => setHidden(item.id, false)}
                >
                  <IconEye className="size-3.5" />
                </Button>
              )
            ) : null}
          </div>
        </CardHeader>
        <CardContent className={cn(editing && "pointer-events-none select-none")}>
          {def.render(data)}
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      {editing ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
          <p className="text-sm text-muted-foreground">
            Drag panels to reorder, resize with arrows, and hide panels you do not need. Layout is
            saved on this device.
          </p>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLayout(defaultLayout(defs))}
            >
              <IconRotateClockwise className="size-4" /> Reset
            </Button>
            <Button size="sm" onClick={() => onEditingChange(false)}>
              Done
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
        {visibleLayout.map((item) => renderPanel(item))}
      </div>

      {editing && hiddenLayout.length > 0 ? (
        <div className="mt-8 space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            Hidden panels ({hiddenLayout.length})
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
            {hiddenLayout.map((item) => renderPanel(item, true))}
          </div>
        </div>
      ) : null}
    </>
  )
}
