import * as React from "react"
import {
  IconCopy,
  IconClipboard,
  IconEye,
  IconEyeOff,
  IconGripVertical,
  IconMaximize,
  IconMinimize,
  IconRotateClockwise,
} from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Textarea } from "@workspace/ui/components/textarea"
import { cn } from "@workspace/ui/lib/utils"
import { getCardDefs } from "@/components/dashboard/cards"
import type { DashboardData } from "@/lib/dashboard-metrics"
import {
  CARD_WIDTHS,
  defaultLayout,
  loadLayoutFromStorage,
  mergeLayout,
  parseLayoutPayload,
  readClipboard,
  saveLayoutToStorage,
  serializeLayout,
  writeClipboard,
  type LayoutItem,
} from "@/lib/dashboard-layout"

const SPAN: Record<LayoutItem["width"], string> = {
  sm: "md:col-span-3",
  md: "md:col-span-6",
  lg: "md:col-span-8",
  xl: "md:col-span-12",
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

  const [layout, setLayout] = React.useState<LayoutItem[]>(() => loadLayoutFromStorage(defs))
  const [dragId, setDragId] = React.useState<string | null>(null)
  const [copyMsg, setCopyMsg] = React.useState<string | null>(null)
  const [copyError, setCopyError] = React.useState<string | null>(null)
  const [pasteOpen, setPasteOpen] = React.useState(false)
  const [pasteText, setPasteText] = React.useState("")
  const [pasteError, setPasteError] = React.useState<string | null>(null)
  const [pasteHint, setPasteHint] = React.useState<string | null>(null)
  const [pasteWarnings, setPasteWarnings] = React.useState<string[]>([])

  React.useEffect(() => {
    setLayout((prev) => mergeLayout(prev, defs))
  }, [defs])

  React.useEffect(() => {
    saveLayoutToStorage(layout)
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
        const idx = CARD_WIDTHS.indexOf(item.width)
        const nextIdx = Math.min(CARD_WIDTHS.length - 1, Math.max(0, idx + dir))
        return { ...item, width: CARD_WIDTHS[nextIdx] ?? item.width }
      }),
    )

  const setHidden = (id: string, hidden: boolean) =>
    setLayout((prev) =>
      prev.map((item) => (item.id === id ? { ...item, hidden } : item)),
    )

  const currentJson = serializeLayout(layout)

  const handleCopy = async () => {
    setCopyError(null)
    const result = await writeClipboard(currentJson)
    if (result.ok) {
      setCopyMsg("Layout copied")
      window.setTimeout(() => setCopyMsg(null), 2500)
      return
    }
    setCopyError(result.error)
    setPasteText(currentJson)
    setPasteError(null)
    setPasteHint("Copy failed. Select the JSON below and copy it manually.")
    setPasteWarnings([])
    setPasteOpen(true)
  }

  const openPaste = async () => {
    setPasteError(null)
    setPasteWarnings([])
    setPasteHint(null)
    setCopyError(null)
    const clip = await readClipboard()
    if (clip.ok) {
      setPasteText(clip.text)
      setPasteHint("Clipboard contents loaded. Review and apply.")
    } else {
      setPasteText("")
      setPasteHint(clip.error)
    }
    setPasteOpen(true)
  }

  const applyPastedLayout = () => {
    const parsed = parseLayoutPayload(pasteText, defs)
    if (!parsed.ok) {
      setPasteError(parsed.error)
      setPasteWarnings([])
      return
    }
    setLayout(parsed.items)
    setPasteError(null)
    setPasteWarnings(parsed.warnings)
    setPasteOpen(false)
    setCopyMsg(
      parsed.warnings.length
        ? "Layout applied, with some panels adjusted"
        : "Layout applied",
    )
    window.setTimeout(() => setCopyMsg(null), 2500)
  }

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
          <div className="flex flex-wrap items-center gap-2">
            {copyMsg ? <p className="text-sm text-primary">{copyMsg}</p> : null}
            {copyError ? <p className="text-sm text-destructive">{copyError}</p> : null}
            <Button variant="outline" size="sm" onClick={() => void handleCopy()}>
              <IconCopy className="size-4" /> Copy
            </Button>
            <Button variant="outline" size="sm" onClick={() => void openPaste()}>
              <IconClipboard className="size-4" /> Paste
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setLayout(defaultLayout(defs))}>
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

      <Dialog open={pasteOpen} onOpenChange={setPasteOpen}>
        <DialogContent className="max-h-[min(90dvh,36rem)] w-full max-w-lg overflow-y-auto overscroll-contain sm:max-w-lg">
          <DialogHeader className="shrink-0">
            <DialogTitle>Dashboard layout</DialogTitle>
            <DialogDescription>
              Paste a copied layout JSON blob. Unknown panels are ignored; missing panels are added
              at the end.
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain">
            {pasteHint ? <p className="text-sm text-muted-foreground">{pasteHint}</p> : null}
            <Textarea
              value={pasteText}
              onChange={(e) => {
                setPasteText(e.target.value)
                setPasteError(null)
              }}
              spellCheck={false}
              className="h-40 max-h-40 min-h-32 field-sizing-fixed resize-none overflow-auto font-mono text-xs"
              placeholder='{"v":1,"items":[{"id":"profit","width":"md"}]}'
              aria-invalid={Boolean(pasteError)}
            />
            {pasteError ? <p className="text-sm text-destructive">{pasteError}</p> : null}
            {pasteWarnings.length > 0 ? (
              <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                {pasteWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}
          </div>
          <DialogFooter className="shrink-0">
            <Button type="button" variant="ghost" onClick={() => setPasteOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={applyPastedLayout}>
              Apply layout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
