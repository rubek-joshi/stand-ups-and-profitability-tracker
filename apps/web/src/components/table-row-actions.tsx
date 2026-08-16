import * as React from "react"
import { Link } from "@tanstack/react-router"
import { Button, buttonVariants } from "@workspace/ui/components/button"
import { TableCell, TableHead } from "@workspace/ui/components/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"

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
            onClick={onClick}
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
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
