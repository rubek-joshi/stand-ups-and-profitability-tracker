import {
  IconCheck,
  IconEye,
  IconFileInvoice,
  IconPencil,
  IconReceiptOff,
  IconTrash,
  IconX,
} from "@tabler/icons-react"
import { Badge } from "@workspace/ui/components/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import {
  NavigableTableRow,
  TableActionButton,
  TableActionLink,
  TableActionsCell,
  TableActionsHead,
} from "@/components/table-row-actions"
import { ClientLink, ProjectLink } from "@/components/resource-link"
import {
  AMC_STATUS_META,
  amcDisplayStatus,
  amcEnd,
  amcStart,
  daysBetween,
  fmtAmcDate,
} from "@/lib/amc"
import { formatNpr } from "@/lib/money"
import type { AmcRecord } from "@/lib/types"

export function AmcTable({
  items,
  onRenew,
  onDecline,
  onEdit,
  onDelete,
  onInvoice,
  onWriteOff,
  canWriteOff,
  canDelete = false,
  hideProject = false,
}: {
  items: AmcRecord[]
  onRenew?: (amc: AmcRecord) => void
  onDecline?: (amc: AmcRecord) => void
  onEdit?: (amc: AmcRecord) => void
  onDelete?: (amc: AmcRecord) => void
  onInvoice?: (amc: AmcRecord) => void
  onWriteOff?: (amc: AmcRecord) => void
  canWriteOff?: (amc: AmcRecord) => boolean
  canDelete?: boolean
  hideProject?: boolean
}) {
  const today = new Date()

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            {hideProject ? null : <TableHead>Project</TableHead>}
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Period</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Remaining</TableHead>
            <TableActionsHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((amc) => {
            const status = amcDisplayStatus(amc, today)
            const meta = AMC_STATUS_META[status]
            const start = amcStart(amc)
            const end = amcEnd(amc)
            const remaining = daysBetween(today, new Date(`${end}T00:00:00`))
            const startsIn = daysBetween(today, new Date(`${start}T00:00:00`))
            const cancelled =
              amc.status === "cancelled" || amc.renewalDecision === "declined"
            const showRenewal =
              Boolean(onRenew && onDecline) &&
              (status === "awaiting-decision" || status === "expiring")
            const canEdit = Boolean(onEdit) && !cancelled
            const showDelete = Boolean(canDelete && onDelete)
            const remainingLabel =
              status === "upcoming"
                ? `Starts in ${startsIn}d`
                : remaining >= 0
                  ? `${remaining}d left`
                  : `Ended ${Math.abs(remaining)}d ago`

            return (
              <NavigableTableRow
                key={amc.id}
                to="/projects/$id"
                params={{ id: amc.projectId }}
              >
                {hideProject ? null : (
                  <TableCell>
                    <div className="min-w-0">
                      <ProjectLink id={amc.projectId}>
                        {amc.projectName ?? "Project"}
                      </ProjectLink>
                      {amc.clientId ? (
                        <div className="text-xs text-muted-foreground">
                          <ClientLink id={amc.clientId}>
                            {amc.clientName ?? "—"}
                          </ClientLink>
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground">
                          {amc.clientName ?? "—"}
                        </div>
                      )}
                    </div>
                  </TableCell>
                )}
                <TableCell>
                  <Badge variant={amc.type === "paid" ? "default" : "secondary"}>
                    {amc.type === "paid" ? "Paid" : "Complimentary"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={meta.variant}>{meta.label}</Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                  {fmtAmcDate(start)} → {fmtAmcDate(end)}
                </TableCell>
                <TableCell className="tabular-nums">
                  {amc.type === "paid" && amc.amcAmountPaisa
                    ? formatNpr(amc.amcAmountPaisa)
                    : "—"}
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm">
                  {remainingLabel}
                </TableCell>
                <TableActionsCell>
                  <TableActionLink
                    label="View project"
                    to="/projects/$id"
                    params={{ id: amc.projectId }}
                  >
                    <IconEye className="size-3.5" />
                  </TableActionLink>
                  {showRenewal ? (
                    <>
                      <TableActionButton
                        label="Client will continue"
                        onClick={() => onRenew?.(amc)}
                      >
                        <IconCheck className="size-3.5" />
                      </TableActionButton>
                      <TableActionButton
                        label="Declined"
                        onClick={() => onDecline?.(amc)}
                      >
                        <IconX className="size-3.5" />
                      </TableActionButton>
                    </>
                  ) : null}
                  {canEdit ? (
                    <TableActionButton label="Edit" onClick={() => onEdit?.(amc)}>
                      <IconPencil className="size-3.5" />
                    </TableActionButton>
                  ) : null}
                  {onInvoice &&
                  amc.type === "paid" &&
                  amc.status !== "cancelled" ? (
                    <TableActionButton
                      label="Invoice"
                      onClick={() => onInvoice(amc)}
                    >
                      <IconFileInvoice className="size-3.5" />
                    </TableActionButton>
                  ) : null}
                  {onWriteOff &&
                  amc.type === "paid" &&
                  amc.status !== "cancelled" ? (
                    <TableActionButton
                      label="Write off"
                      disabled={canWriteOff ? !canWriteOff(amc) : false}
                      onClick={() => onWriteOff(amc)}
                    >
                      <IconReceiptOff className="size-3.5" />
                    </TableActionButton>
                  ) : null}
                  {showDelete ? (
                    <TableActionButton
                      label="Delete"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => onDelete?.(amc)}
                    >
                      <IconTrash className="size-3.5" />
                    </TableActionButton>
                  ) : null}
                </TableActionsCell>
              </NavigableTableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
