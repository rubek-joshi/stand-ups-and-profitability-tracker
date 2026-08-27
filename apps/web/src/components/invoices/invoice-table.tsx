import { Link } from "@tanstack/react-router"
import { IconEye, IconPencil } from "@tabler/icons-react"
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
import { StatusBadge } from "@/components/health-badge"
import { toDateKey } from "@/lib/dates"
import { isInvoiceOverdue } from "@/lib/invoice-analytics"
import { formatNpr } from "@/lib/money"
import type { Invoice } from "@/lib/types"

export function InvoiceTable({
  invoices,
  showProject = true,
  canMutate = false,
  onEdit,
}: {
  invoices: Invoice[]
  showProject?: boolean
  canMutate?: boolean
  onEdit?: (invoice: Invoice) => void
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Number</TableHead>
            {showProject ? <TableHead>Project</TableHead> : null}
            <TableHead>Date</TableHead>
            <TableHead>Amount / total</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Payment date</TableHead>
            <TableActionsHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((invoice) => {
            const overdue = isInvoiceOverdue(invoice)
            return (
              <NavigableTableRow
                key={invoice.id}
                to="/invoices/$id"
                params={{ id: invoice.id }}
              >
                <TableCell>
                  <Link
                    to="/invoices/$id"
                    params={{ id: invoice.id }}
                    className="font-medium hover:underline"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {invoice.invoiceNumber}
                  </Link>
                </TableCell>
                {showProject ? (
                  <TableCell>
                    {invoice.project?.id ? (
                      <div className="min-w-0">
                        <ProjectLink id={invoice.project.id}>
                          {invoice.project.name}
                        </ProjectLink>
                        {invoice.project.client?.id ? (
                          <div className="text-xs text-muted-foreground">
                            <ClientLink id={invoice.project.client.id}>
                              {invoice.project.client.name}
                            </ClientLink>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                ) : null}
                <TableCell className="whitespace-nowrap">
                  {toDateKey(invoice.invoiceDate)}
                </TableCell>
                <TableCell>
                  <div className="font-medium tabular-nums">
                    {formatNpr(invoice.totalPaisa)}
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {formatNpr(invoice.amountPaisa)}
                    {Number(invoice.vatPaisa) > 0
                      ? ` + ${formatNpr(invoice.vatPaisa)} VAT`
                      : ""}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={invoice.status} />
                    {overdue ? (
                      <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-200">
                        Overdue
                      </Badge>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {invoice.paymentDate
                    ? toDateKey(invoice.paymentDate)
                    : "—"}
                </TableCell>
                <TableActionsCell>
                  <TableActionLink
                    label="View"
                    to="/invoices/$id"
                    params={{ id: invoice.id }}
                  >
                    <IconEye className="size-3.5" />
                  </TableActionLink>
                  {canMutate && invoice.status === "pending" && onEdit ? (
                    <TableActionButton
                      label="Edit"
                      onClick={() => onEdit(invoice)}
                    >
                      <IconPencil className="size-3.5" />
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
