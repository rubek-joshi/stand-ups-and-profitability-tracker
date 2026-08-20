import * as React from "react"
import { IconNotes } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import { focusStandupNotes, MarkdownNotes } from "./markdown-notes"

type Props = {
  entryId: string
  value: string
  disabled?: boolean
  onChange: (value: string) => void
  className?: string
}

type MiscController = {
  open: () => void
  toggle: () => void
}

const miscControllers = new Map<string, MiscController>()

/** Open miscellaneous markdown for an entry (used by Ctrl+Enter navigation). */
export function openMiscellaneousNotes(entryId: string) {
  miscControllers.get(entryId)?.open()
}

/** Toggle miscellaneous markdown for an entry (Ctrl+Shift+N). */
export function toggleMiscellaneousNotes(entryId: string) {
  miscControllers.get(entryId)?.toggle()
}

/** Icon toggle that reveals the per-employee miscellaneous markdown editor. */
export function MiscellaneousNotesToggle({
  entryId,
  value,
  disabled,
  onChange,
  className,
}: Props) {
  const [open, setOpen] = React.useState(false)
  const hasContent = value.trim().length > 0

  React.useEffect(() => {
    miscControllers.set(entryId, {
      open: () => setOpen(true),
      toggle: () =>
        setOpen((prev) => {
          const next = !prev
          if (next) {
            window.setTimeout(() => focusStandupNotes(entryId), 40)
          }
          return next
        }),
    })
    return () => {
      miscControllers.delete(entryId)
    }
  }, [entryId])

  return (
    <div
      data-standup-misc={entryId}
      className={cn("space-y-3", className)}
    >
      <div className="flex justify-end">
        <Button
          type="button"
          size="icon-sm"
          variant={open ? "secondary" : "ghost"}
          disabled={disabled}
          aria-expanded={open}
          aria-label={open ? "Hide miscellaneous notes" : "Show miscellaneous notes"}
          title={open ? "Hide miscellaneous" : "Miscellaneous notes"}
          className="relative text-muted-foreground"
          onClick={() => setOpen((prev) => !prev)}
        >
          <IconNotes className="size-4" />
          {hasContent && !open ? (
            <span
              aria-hidden
              className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-primary"
            />
          ) : null}
        </Button>
      </div>
      {open ? (
        <MarkdownNotes
          editorKey={entryId}
          value={value}
          disabled={disabled}
          onChange={onChange}
          placeholder="Anything else the team should know…"
        />
      ) : null}
    </div>
  )
}
