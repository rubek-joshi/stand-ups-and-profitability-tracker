import * as React from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { Button, buttonVariants } from "@workspace/ui/components/button"
import { TableCell, TableHead, TableRow } from "@workspace/ui/components/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"

const INTERACTIVE_ROW_CLICK_SELECTOR = [
  "a",
  "button",
  "input",
  "textarea",
  "select",
  "label",
  "[role='button']",
  "[role='menuitem']",
  "[role='checkbox']",
  "[data-slot='row-actions']",
  "[data-no-row-click]",
].join(",")

/** True when the event target (or an ancestor) should handle the click itself. */
export function isInteractiveRowClickTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return true
  return Boolean(target.closest(INTERACTIVE_ROW_CLICK_SELECTOR))
}

type NavigableTableRowProps = React.ComponentProps<typeof TableRow> & {
  to: string
  params?: Record<string, string>
  search?: Record<string, unknown>
}

/** Full-row navigation while leaving links/buttons/actions clickable on their own. */
export function NavigableTableRow({
  to,
  params,
  search,
  className,
  onClick,
  onKeyDown,
  children,
  ...props
}: NavigableTableRowProps) {
  const navigate = useNavigate()

  const go = React.useCallback(() => {
    void navigate({
      to: to as never,
      ...(params ? { params: params as never } : {}),
      ...(search ? { search: search as never } : {}),
    })
  }, [navigate, params, search, to])

  return (
    <TableRow
      role="link"
      tabIndex={0}
      className={cn("cursor-pointer", className)}
      onClick={(event) => {
        onClick?.(event)
        if (event.defaultPrevented) return
        if (event.button !== 0) return
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
          return
        }
        if (isInteractiveRowClickTarget(event.target)) return
        go()
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event)
        if (event.defaultPrevented) return
        if (event.key !== "Enter" && event.key !== " ") return
        if (isInteractiveRowClickTarget(event.target)) return
        event.preventDefault()
        go()
      }}
      {...props}
    >
      {children}
    </TableRow>
  )
}

/** Header cell for the hover-revealed actions column. */
export function TableActionsHead({ className }: { className?: string }) {
  return (
    <TableHead className={cn("w-0 text-right", className)}>
      <span className="sr-only">Actions</span>
    </TableHead>
  )
}

/** Cell that hosts row action icon buttons (revealed on row hover via CSS). */
export function TableActionsCell({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <TableCell className={cn("w-0 text-right", className)}>
      <div
        data-slot="row-actions"
        className="inline-flex items-center justify-end gap-0.5"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </TableCell>
  )
}

type TableActionButtonProps = {
  label: string
  children: React.ReactNode
  variant?: React.ComponentProps<typeof Button>["variant"]
  disabled?: boolean
  onClick?: React.MouseEventHandler<HTMLButtonElement>
  className?: string
}

/** Icon button action with tooltip. */
export function TableActionButton({
  label,
  children,
  variant = "ghost",
  disabled,
  onClick,
  className,
}: TableActionButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            size="icon-xs"
            variant={variant}
            disabled={disabled}
            aria-label={label}
            className={className}
            onClick={(event) => {
              event.stopPropagation()
              onClick?.(event)
            }}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** Icon link action with tooltip. */
export function TableActionLink({
  label,
  children,
  to,
  params,
  className,
}: {
  label: string
  children: React.ReactNode
  to: string
  params?: Record<string, string>
  className?: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            to={to as never}
            params={params as never}
            aria-label={label}
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon-xs" }),
              className,
            )}
            onClick={(event) => event.stopPropagation()}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
