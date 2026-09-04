import { Link } from "@tanstack/react-router"
import {
  IconChevronDown,
  IconChevronUp,
  IconEye,
  IconPencil,
  IconSelector,
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
import { StatusBadge } from "@/components/health-badge"
import { toDateKey } from "@/lib/dates"
import { isInvoiceOverdue } from "@/lib/invoice-analytics"
import type { SortDir } from "@/lib/list-query"
import { formatNpr } from "@/lib/money"
import type { Invoice } from "@/lib/types"

export const INVOICE_SORT_FIELDS = ["invoiceNumber", "invoiceDate"] as const
export type InvoiceSortBy = (typeof INVOICE_SORT_FIELDS)[number]

export function defaultInvoiceSortDir(column: InvoiceSortBy): SortDir {
  return column === "invoiceNumber" ? "asc" : "desc"
}

export function InvoiceTable({
  invoices,
  showProject = true,
  canMutate = false,
  onEdit,
  sortBy,
  sortDir,
  onSort,
}: {
  invoices: Invoice[]
  showProject?: boolean
  canMutate?: boolean
  onEdit?: (invoice: Invoice) => void
  sortBy?: InvoiceSortBy
  sortDir?: SortDir
  onSort?: (column: InvoiceSortBy) => void
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            {onSort ? (
              <SortableTableHead
                label="Number"
                column="invoiceNumber"
                active={sortBy === "invoiceNumber"}
                dir={sortDir}
                onSort={onSort}
              />
            ) : (
              <TableHead>Number</TableHead>
            )}
            {showProject ? <TableHead>Project</TableHead> : null}
            {onSort ? (
              <SortableTableHead
                label="Date"
                column="invoiceDate"
                active={sortBy === "invoiceDate"}
                dir={sortDir}
                onSort={onSort}
              />
            ) : (
              <TableHead>Date</TableHead>
            )}
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

function SortableTableHead({
  label,
  column,
  active,
  dir,
  onSort,
}: {
  label: string
  column: InvoiceSortBy
  active: boolean
  dir?: SortDir
  onSort: (column: InvoiceSortBy) => void
}) {
  const sortState = active ? (dir === "asc" ? "ascending" : "descending") : "none"
  const Icon = !active
    ? IconSelector
    : dir === "asc"
      ? IconChevronUp
      : IconChevronDown
  return (
    <TableHead aria-sort={sortState}>
      <button
        type="button"
        className="inline-flex items-center gap-1 font-medium hover:text-foreground"
        onClick={() => onSort(column)}
        aria-label={
          active
            ? `Sort by ${label}, currently ${sortState}. Click to reverse.`
            : `Sort by ${label}`
        }
      >
        {label}
        <Icon
          className={
            active
              ? "size-3.5 text-foreground"
              : "size-3.5 text-muted-foreground"
          }
        />
      </button>
    </TableHead>
  )
}
