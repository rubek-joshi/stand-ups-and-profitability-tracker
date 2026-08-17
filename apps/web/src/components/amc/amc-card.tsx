import { Link } from "@tanstack/react-router"
import {
  IconCalendar,
  IconCheck,
  IconDotsVertical,
  IconGift,
  IconCurrencyRupee,
  IconPencil,
  IconTrash,
  IconX,
} from "@tabler/icons-react"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardHeader } from "@workspace/ui/components/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Progress } from "@workspace/ui/components/progress"
import {
  amcDisplayStatus,
  amcEnd,
  amcProgress,
  amcStart,
  daysBetween,
  fmtAmcDate,
  type AmcDisplayStatus,
} from "@/lib/amc"
import { formatNpr } from "@/lib/money"
import type { AmcRecord } from "@/lib/types"

const STATUS_META: Record<
  AmcDisplayStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  ongoing: { label: "Ongoing", variant: "default" },
  expiring: { label: "Expiring soon", variant: "secondary" },
  upcoming: { label: "Upcoming", variant: "outline" },
  "awaiting-decision": { label: "Awaiting decision", variant: "destructive" },
  expired: { label: "Expired", variant: "outline" },
}

export function AmcCard({
  amc,
  onRenew,
  onDecline,
  onEdit,
  onDelete,
  canDelete = false,
}: {
  amc: AmcRecord
  onRenew?: (amc: AmcRecord) => void
  onDecline?: (amc: AmcRecord) => void
  onEdit?: (amc: AmcRecord) => void
  onDelete?: (amc: AmcRecord) => void
  canDelete?: boolean
}) {
  const status = amcDisplayStatus(amc)
  const meta = STATUS_META[status]
  const today = new Date()
  const pct = amcProgress(amc, today)
  const end = amcEnd(amc)
  const start = amcStart(amc)
  const remaining = daysBetween(today, new Date(`${end}T00:00:00`))
  const startsIn = daysBetween(today, new Date(`${start}T00:00:00`))
  const projectName = amc.projectName ?? "Project"
  const clientName = amc.clientName ?? "—"
  const cancelled = amc.status === "cancelled" || amc.renewalDecision === "declined"
  const showRenewal =
    Boolean(onRenew && onDecline) &&
    (status === "awaiting-decision" || status === "expiring")
  const canEdit = Boolean(onEdit) && !cancelled
  const showDelete = Boolean(canDelete && onDelete)
  const showMenu = canEdit || showDelete

  return (
    <Card className="transition-colors hover:bg-muted/30">
      <CardHeader className="space-y-3 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              to="/projects/$id"
              params={{ id: amc.projectId }}
              className="truncate text-base font-semibold hover:underline"
            >
              {projectName}
            </Link>
            <p className="truncate text-sm text-muted-foreground">{clientName}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Badge variant={meta.variant}>{meta.label}</Badge>
            {showMenu ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="size-7"
                      aria-label="AMC actions"
                    />
                  }
                >
                  <IconDotsVertical className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-auto min-w-36">
                  {canEdit ? (
                    <DropdownMenuItem onClick={() => onEdit?.(amc)}>
                      <IconPencil />
                      Edit
                    </DropdownMenuItem>
                  ) : null}
                  {showDelete ? (
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => onDelete?.(amc)}
                    >
                      <IconTrash />
                      Delete
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={amc.type === "paid" ? "default" : "secondary"}>
            {amc.type === "paid" ? (
              <IconCurrencyRupee className="size-3" />
            ) : (
              <IconGift className="size-3" />
            )}
            {amc.type === "paid" ? "Paid AMC" : "Complimentary"}
          </Badge>
          {amc.amcAmountPaisa ? (
            <span className="text-xs text-muted-foreground">
              {formatNpr(amc.amcAmountPaisa)}
            </span>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <IconCalendar className="size-3.5" />
            {fmtAmcDate(start)} → {fmtAmcDate(end)}
          </div>
          <Progress value={pct} className="h-1.5" />
          <p className="text-xs font-medium">
            {status === "upcoming"
              ? `Starts in ${startsIn} day${startsIn === 1 ? "" : "s"}`
              : remaining >= 0
                ? `${remaining} day${remaining === 1 ? "" : "s"} left`
                : `Ended ${Math.abs(remaining)} days ago`}
          </p>
        </div>

        {amc.notes ? (
          <p className="text-xs text-muted-foreground">{amc.notes}</p>
        ) : null}

        {showRenewal ? (
          <div className="flex flex-wrap gap-2 border-t pt-3">
            <Button size="sm" onClick={() => onRenew?.(amc)}>
              <IconCheck className="size-3.5" />
              Client will continue
            </Button>
            <Button size="sm" variant="outline" onClick={() => onDecline?.(amc)}>
              <IconX className="size-3.5" />
              Declined
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
