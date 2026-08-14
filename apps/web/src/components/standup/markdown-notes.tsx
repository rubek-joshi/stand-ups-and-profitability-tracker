import * as React from "react"
import { IconEye, IconPencil } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { Textarea } from "@workspace/ui/components/textarea"
import { cn } from "@workspace/ui/lib/utils"

function renderMarkdown(md: string) {
  const escaped = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")

  const lines = escaped.split("\n")
  const html: string[] = []
  let inList = false

  const inline = (t: string) =>
    t
      .replace(/`([^`]+)`/g, "<code class=\"rounded bg-muted px-1 py-0.5 text-[0.85em]\">$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|\W)\*([^*]+)\*/g, "$1<em>$2</em>")
      .replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" target="_blank" rel="noreferrer" class="underline">$1</a>',
      )

  for (const line of lines) {
    const listMatch = /^\s*[-*]\s+(.*)$/.exec(line)
    if (listMatch) {
      if (!inList) {
        html.push('<ul class="list-disc space-y-1 pl-5">')
        inList = true
      }
      html.push(`<li>${inline(listMatch[1] ?? "")}</li>`)
      continue
    }
    if (inList) {
      html.push("</ul>")
      inList = false
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line)
    if (heading) {
      const level = (heading[1] ?? "#").length
      html.push(
        `<h${level} class="font-semibold ${level === 1 ? "text-base" : "text-sm"}">${inline(heading[2] ?? "")}</h${level}>`,
      )
    } else if (line.trim() === "") {
      html.push('<div class="h-2"></div>')
    } else {
      html.push(`<p>${inline(line)}</p>`)
    }
  }
  if (inList) html.push("</ul>")
  return html.join("")
}

type Props = {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
}

export function MarkdownNotes({ value, onChange, disabled, placeholder }: Props) {
  const [preview, setPreview] = React.useState(false)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Standup notes · markdown
        </span>
        <Button
          type="button"
          size="sm"
          variant={preview ? "secondary" : "outline"}
          disabled={disabled}
          className="h-7 gap-1.5 px-2 text-xs"
          onClick={() => setPreview((p) => !p)}
        >
          {preview ? <IconPencil className="size-3" /> : <IconEye className="size-3" />}
          {preview ? "Edit" : "Preview"}
        </Button>
      </div>

      {preview ? (
        <div
          className={cn(
            "min-h-26 rounded-lg border bg-muted/40 px-3 py-2 text-sm leading-relaxed",
            "[&_code]:font-mono [&_p+p]:mt-2",
          )}
          dangerouslySetInnerHTML={{
            __html: value.trim()
              ? renderMarkdown(value)
              : '<p class="text-muted-foreground">Nothing written yet.</p>',
          }}
        />
      ) : (
        <Textarea
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? "- Project A: …\n- Project B: …\n- Blockers: …"}
          className="min-h-26 resize-y font-mono text-[13px] leading-relaxed"
        />
      )}
    </div>
  )
}
