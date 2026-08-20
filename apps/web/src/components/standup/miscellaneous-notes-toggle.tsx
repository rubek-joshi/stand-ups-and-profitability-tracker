import * as React from "react"
import { IconNotes } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import { MarkdownNotes } from "./markdown-notes"

type Props = {
  entryId: string
  value: string
  disabled?: boolean
  onChange: (value: string) => void
  className?: string
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

  return (
    <div className={cn("space-y-3", className)}>
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
