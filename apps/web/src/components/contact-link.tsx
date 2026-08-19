import * as React from "react"
import { IconCheck, IconCopy } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"

function telHref(value: string) {
  return `tel:${value.replace(/[^\d+]/g, "")}`
}

function ContactLink({
  href,
  value,
  withCopy,
}: {
  href: string
  value: string
  withCopy?: boolean | "hover"
}) {
  const [copied, setCopied] = React.useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  if (!withCopy) {
    return (
      <a
        href={href}
        className="truncate font-medium text-primary underline-offset-4 hover:underline"
      >
        {value}
      </a>
    )
  }

  return (
    <span className="inline-flex max-w-full items-center gap-1">
      <a
        href={href}
        className="truncate font-medium text-primary underline-offset-4 hover:underline"
      >
        {value}
      </a>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="size-7 shrink-0"
        data-slot={withCopy === "hover" ? "row-actions" : undefined}
        aria-label={copied ? "Copied" : `Copy ${value}`}
        onClick={() => void copy()}
      >
        {copied ? <IconCheck className="size-3.5" /> : <IconCopy className="size-3.5" />}
      </Button>
    </span>
  )
}

export function MailLink({
  value,
  withCopy = false,
}: {
  value: string
  withCopy?: boolean | "hover"
}) {
  return <ContactLink href={`mailto:${value}`} value={value} withCopy={withCopy} />
}

export function TelLink({
  value,
  withCopy = false,
}: {
  value: string
  withCopy?: boolean | "hover"
}) {
  return <ContactLink href={telHref(value)} value={value} withCopy={withCopy} />
}
