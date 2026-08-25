import * as React from "react"
import { IconChevronLeft, IconChevronRight, IconInfoCircle } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { MarkdownPreview } from "@/components/standup/markdown-preview"
import { api, ApiError, type PaginatedEnvelope } from "@/lib/api"
import {
  formatShortcutKey,
  isApplePlatform,
} from "@/lib/keyboard"
import type { EmployeeGroup } from "@/lib/types"

type Props = {
  viewingEveryone: boolean
  preferredGroupId?: string | null
}

function hasGuidelines(value: string | null | undefined): boolean {
  return Boolean(value?.trim())
}

export function StandupGuidelinesControl({
  viewingEveryone,
  preferredGroupId,
}: Props) {
  const [groups, setGroups] = React.useState<EmployeeGroup[]>([])
  const [open, setOpen] = React.useState(false)
  const [selectedId, setSelectedId] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    void api<PaginatedEnvelope<EmployeeGroup[]>>("/employee-groups")
      .then((res) => {
        if (!cancelled) setGroups(res.data)
      })
      .catch((e) => {
        if (!cancelled) {
          console.error(
            e instanceof ApiError ? e.message : "Failed to load employee groups",
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const withGuidelines = groups.filter((group) =>
    hasGuidelines(group.standupGuidelines),
  )
  const preferred = preferredGroupId
    ? withGuidelines.find((group) => group.id === preferredGroupId)
    : undefined
  const canShow = viewingEveryone
    ? withGuidelines.length > 0
    : Boolean(preferred)

  const toggle = React.useCallback(() => {
    setOpen((prev) => {
      if (prev) {
        setSelectedId(null)
        return false
      }
      setSelectedId(null)
      return true
    })
  }, [])

  React.useEffect(() => {
    if (!canShow) return
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat) return
      if (!event.altKey || event.shiftKey || event.ctrlKey || event.metaKey) {
        return
      }
      if (event.code !== "KeyG") return
      event.preventDefault()
      event.stopPropagation()
      toggle()
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [canShow, toggle])

  if (!canShow) return null

  const selected =
    selectedId != null
      ? withGuidelines.find((group) => group.id === selectedId)
      : viewingEveryone
        ? undefined
        : preferred
  const showPicker = viewingEveryone && !selected
  const shortcutLabel = `${formatShortcutKey("Alt", isApplePlatform())}+G`

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              aria-label={`Stand-up guidelines (${shortcutLabel})`}
              onClick={toggle}
            />
          }
        >
          <IconInfoCircle className="size-4" />
        </TooltipTrigger>
        <TooltipContent>
          Stand-up guidelines ({shortcutLabel})
        </TooltipContent>
      </Tooltip>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setSelectedId(null)
        }}
      >
        <DialogContent className="flex flex-col gap-4 sm:max-w-lg">
          <DialogHeader className="shrink-0">
            {viewingEveryone && selected ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="-ml-2 h-8 w-fit gap-1 px-2"
                onClick={() => setSelectedId(null)}
              >
                <IconChevronLeft className="size-4" />
                All guidelines
              </Button>
            ) : null}
            <DialogTitle>
              {showPicker ? "Stand-up guidelines" : (selected?.name ?? "Stand-up guidelines")}
            </DialogTitle>
            {showPicker ? (
              <DialogDescription>
                Choose a group to view its stand-up guidelines.
              </DialogDescription>
            ) : null}
          </DialogHeader>
          <div className="max-h-[min(28rem,60dvh)] overflow-y-auto pr-1">
            {showPicker ? (
              <div className="flex flex-col gap-2">
                {withGuidelines.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    className="flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left text-sm hover:bg-muted/60"
                    onClick={() => setSelectedId(group.id)}
                  >
                    <span className="min-w-0 font-medium">{group.name}</span>
                    <IconChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                ))}
              </div>
            ) : selected?.standupGuidelines?.trim() ? (
              <MarkdownPreview markdown={selected.standupGuidelines} />
            ) : (
              <p className="text-sm text-muted-foreground">
                No stand-up guidelines for this group.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
