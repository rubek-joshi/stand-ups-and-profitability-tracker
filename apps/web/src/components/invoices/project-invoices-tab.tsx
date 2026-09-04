import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  IconAlertTriangle,
  IconCalendarOff,
  IconCircleCheck,
  IconDotsVertical,
  IconPencil,
  IconPlus,
  IconReceipt,
  IconTrash,
} from "@tabler/icons-react"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { useConfirmDialog } from "@/components/confirm-dialog"
import { InvoiceAnalytics } from "@/components/invoices/invoice-analytics"
import { InvoiceFormDialog } from "@/components/invoices/invoice-form-dialog"
import {
  defaultInvoiceSortDir,
  InvoiceTable,
  type InvoiceSortBy,
} from "@/components/invoices/invoice-table"
import { MarkPaidDialog } from "@/components/invoices/mark-paid-dialog"
import { ListViewToggle } from "@/components/list-view-toggle"
import { PaginationBar } from "@/components/pagination-bar"
import { TableActionButton } from "@/components/table-row-actions"
import { StatusBadge } from "@/components/health-badge"
import { ErrorState, LoadingState } from "@/components/ui-states"
import { api, ApiError } from "@/lib/api"
import type { Envelope, PaginatedEnvelope } from "@/lib/api"
import {
  calendarDaysBetween,
  computeInvoiceAnalytics,
  isInvoiceListStale,
  isInvoiceOverdue,
  paisaNumber,
} from "@/lib/invoice-analytics"
import { toDateKey } from "@/lib/dates"
import { clampPage, totalPagesFor, type SortDir } from "@/lib/list-query"
import type { PageSize } from "@/lib/list-query"
import { formatNpr } from "@/lib/money"
import { nptTodayIso } from "@/lib/standup-age"
import type { Invoice, Project } from "@/lib/types"
import { getStoredView, setStoredView } from "@/lib/view-pref"
import type { ListView } from "@/lib/view-pref"

const INVOICES_VIEW_KEY = "pt_project_invoices_view"

function SummaryCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub?: string
  accent?: string
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className={`mt-1 text-xl font-semibold ${accent ?? ""}`}>
          {value}
        </div>
        {sub ? (
          <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function Row({
  label,
  value,
  bold,
}: {
  label: string
  value: string
  bold?: boolean
}) {
  return (
    <div className="flex justify-between gap-3">
      <span className={bold ? "font-medium" : "text-muted-foreground"}>
        {label}
      </span>
      <span className={bold ? "font-semibold" : ""}>{value}</span>
    </div>
  )
}

export function ProjectInvoicesTab({
  project,
  canMutate,
  page,
  pageSize,
  view,
  onPageChange,
  onPageSizeChange,
  onViewChange,
}: {
  project: Project
  canMutate: boolean
  page: number
  pageSize: PageSize
  view: ListView
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: PageSize) => void
  onViewChange: (view: ListView) => void
}) {
  const { confirm, dialog } = useConfirmDialog()
  const [invoices, setInvoices] = React.useState<Invoice[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [formOpen, setFormOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Invoice | null>(null)
  const [paying, setPaying] = React.useState<Invoice | null>(null)
  const [sortBy, setSortBy] = React.useState<InvoiceSortBy>("invoiceDate")
  const [sortDir, setSortDir] = React.useState<SortDir>("desc")

  React.useLayoutEffect(() => {
    if (view === "table") {
      setStoredView(INVOICES_VIEW_KEY, "table")
      return
    }
    if (getStoredView(INVOICES_VIEW_KEY) !== "table") return
    onViewChange("table")
  }, [])

  const setView = (next: ListView) => {
    setStoredView(INVOICES_VIEW_KEY, next)
    onViewChange(next)
  }

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api<PaginatedEnvelope<Invoice[]>>(
        `/invoices?projectId=${encodeURIComponent(project.id)}`
      )
      setInvoices(res.data)
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to load invoices"
      )
    } finally {
      setLoading(false)
    }
  }, [project.id])

  React.useEffect(() => {
    void load()
  }, [load])

  const analytics = computeInvoiceAnalytics(invoices)
  const budgetPaisa = project.profitability?.revenuePaisa ?? project.budgetPaisa
  const budget = paisaNumber(budgetPaisa)
  const remainingToInvoice = budget - analytics.totalAmountPaisa
  const stale = isInvoiceListStale(invoices)
  const sorted = React.useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1
    return [...invoices].sort((a, b) => {
      if (sortBy === "invoiceNumber") {
        return dir * a.invoiceNumber.localeCompare(b.invoiceNumber)
      }
      return dir * String(a.invoiceDate).localeCompare(String(b.invoiceDate))
    })
  }, [invoices, sortBy, sortDir])
  const totalPages = totalPagesFor(sorted.length, pageSize)
  const safePage = clampPage(page, totalPages)
  const paged = sorted.slice((safePage - 1) * pageSize, safePage * pageSize)

  const toggleSort = (column: InvoiceSortBy) => {
    if (sortBy !== column) {
      setSortBy(column)
      setSortDir(defaultInvoiceSortDir(column))
      return
    }
    setSortDir((prev) => (prev === "desc" ? "asc" : "desc"))
  }

  async function markPaid(paymentDate: string) {
    if (!paying) return
    try {
      await api<Envelope<Invoice>>(`/invoices/${paying.id}/mark-paid`, {
        method: "POST",
        body: { paymentDate },
      })
      await load()
    } catch (err) {
      alert(
        err instanceof ApiError ? err.message : "Failed to mark invoice paid"
      )
      throw err
    }
  }

  async function deleteInvoice(invoice: Invoice) {
    const ok = await confirm({
      title: "Delete this invoice?",
      description: `Invoice ${invoice.invoiceNumber} for ${formatNpr(invoice.totalPaisa)} will be permanently deleted.`,
      confirmLabel: "Delete",
      destructive: true,
    })
    if (!ok) return
    try {
      await api(`/invoices/${invoice.id}`, { method: "DELETE" })
      await load()
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to delete invoice")
    }
  }

  if (loading) return <LoadingState />
  if (error) return <ErrorState message={error} onRetry={load} />

  return (
    <div className="space-y-6">
      {dialog}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Invoices</h2>
        {canMutate ? (
          <Button size="sm" onClick={() => setFormOpen(true)}>
            <IconPlus className="size-4" />
            Add invoice
          </Button>
        ) : null}
      </div>

      {(analytics.overdueInvoices.length > 0 || stale) && (
        <div className="space-y-2">
          {analytics.overdueInvoices.map((invoice) => (
            <div
              key={invoice.id}
              className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
            >
              <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                Invoice <strong>{invoice.invoiceNumber}</strong> of{" "}
                {formatNpr(invoice.totalPaisa)} has been unpaid for{" "}
                {daysSinceLabel(invoice.invoiceDate)} days (over 15-day limit).
              </span>
            </div>
          ))}
          {stale ? (
            <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
              <IconCalendarOff className="mt-0.5 size-4 shrink-0" />
              <span>
                No invoice issued for this project in the last 30 days.
              </span>
            </div>
          ) : null}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryCard
          label="Total budget"
          value={formatNpr(budgetPaisa)}
          sub="excl. VAT"
        />
        <SummaryCard
          label="Total invoiced"
          value={formatNpr(analytics.totalInvoicedPaisa)}
          sub={`${invoices.length} invoice${invoices.length === 1 ? "" : "s"}`}
        />
        <SummaryCard
          label="Total paid"
          value={formatNpr(analytics.totalPaidPaisa)}
          accent="text-emerald-600 dark:text-emerald-400"
        />
        <SummaryCard
          label="Outstanding"
          value={formatNpr(analytics.outstandingPaisa)}
          accent={
            analytics.outstandingPaisa > 0
              ? "text-amber-600 dark:text-amber-400"
              : "text-emerald-600 dark:text-emerald-400"
          }
          sub="invoiced − paid"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-base font-medium">Invoice history</h3>
            <div className="flex flex-wrap items-center gap-3">
              {analytics.lastInvoice ? (
                <span className="text-xs text-muted-foreground">
                  Last invoice: {toDateKey(analytics.lastInvoice.invoiceDate)}
                </span>
              ) : null}
              {invoices.length > 0 ? (
                <ListViewToggle view={view} onChange={setView} />
              ) : null}
            </div>
          </div>
          {invoices.length === 0 ? (
            <Empty className="min-h-64 border bg-card">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconReceipt />
                </EmptyMedia>
                <EmptyTitle>No invoices yet</EmptyTitle>
                <EmptyDescription>
                  No invoices recorded for this project.
                </EmptyDescription>
              </EmptyHeader>
              {canMutate ? (
                <EmptyContent>
                  <Button className="mt-2" onClick={() => setFormOpen(true)}>
                    <IconPlus className="size-4" />
                    Add first invoice
                  </Button>
                </EmptyContent>
              ) : null}
            </Empty>
          ) : (
            <div className="flex flex-col gap-4">
              {view === "table" ? (
                <InvoiceTable
                  invoices={paged}
                  showProject={false}
                  canMutate={canMutate}
                  onEdit={setEditing}
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
              ) : (
                <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                  {paged.map((invoice) => {
                    const overdue = isInvoiceOverdue(invoice)
                    return (
                      <Card key={invoice.id} size="sm">
                        <CardHeader className="items-center">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <CardTitle>
                              <Link
                                to="/invoices/$id"
                                params={{ id: invoice.id }}
                                className="hover:underline"
                              >
                                {invoice.invoiceNumber}
                              </Link>
                            </CardTitle>
                            <StatusBadge status={invoice.status} />
                            {overdue ? (
                              <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-200">
                                Overdue
                              </Badge>
                            ) : null}
                          </div>
                          {canMutate ? (
                            <CardAction>
                              <div className="flex items-center">
                                {invoice.status === "pending" ? (
                                  <TableActionButton
                                    label="Mark paid"
                                    size="icon-sm"
                                    onClick={() => setPaying(invoice)}
                                  >
                                    <IconCircleCheck />
                                  </TableActionButton>
                                ) : null}
                                <DropdownMenu>
                                  <DropdownMenuTrigger
                                    render={
                                      <Button
                                        size="icon-sm"
                                        variant="ghost"
                                        aria-label="Invoice actions"
                                      />
                                    }
                                  >
                                    <IconDotsVertical />
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent
                                    align="end"
                                    className="min-w-40"
                                  >
                                    <DropdownMenuGroup>
                                      {invoice.status === "pending" ? (
                                        <DropdownMenuItem
                                          onClick={() => setEditing(invoice)}
                                        >
                                          <IconPencil />
                                          Edit
                                        </DropdownMenuItem>
                                      ) : null}
                                      <DropdownMenuItem
                                        variant="destructive"
                                        onClick={() =>
                                          void deleteInvoice(invoice)
                                        }
                                      >
                                        <IconTrash />
                                        Delete
                                      </DropdownMenuItem>
                                    </DropdownMenuGroup>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </CardAction>
                          ) : null}
                        </CardHeader>
                        <CardContent className="flex flex-row items-start justify-between gap-1">
                          <div>
                            <div className="text-xs text-muted-foreground">
                              {formatNpr(invoice.amountPaisa)}
                              {paisaNumber(invoice.vatPaisa) > 0 ? (
                                <span> +{formatNpr(invoice.vatPaisa)} VAT</span>
                              ) : null}
                            </div>
                            <div className="font-semibold">
                              {formatNpr(invoice.totalPaisa)}
                            </div>
                            {budget > 0 ? (
                              <div className="mt-0.5 text-xs text-muted-foreground">
                                {(
                                  (paisaNumber(invoice.amountPaisa) / budget) *
                                  100
                                ).toFixed(1)}
                                % of budget
                              </div>
                            ) : null}
                          </div>
                          <div className="text-sm text-muted-foreground text-right">
                            <div>{toDateKey(invoice.invoiceDate)}</div>
                            {invoice.status === "paid" &&
                            invoice.paymentDate ? (
                              <div className="text-xs">
                                Paid {toDateKey(invoice.paymentDate)} (
                                {calendarDaysBetween(
                                  invoice.invoiceDate,
                                  invoice.paymentDate
                                )}
                                d)
                              </div>
                            ) : null}
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              )}
              <PaginationBar
                page={safePage}
                totalPages={totalPages}
                total={sorted.length}
                pageSize={pageSize}
                onPageChange={onPageChange}
                onPageSizeChange={onPageSizeChange}
              />
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Budget breakdown
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row
                label="Quoted budget"
                value={formatNpr(
                  project.profitability?.budgetPaisa ?? project.budgetPaisa
                )}
              />
              <Row
                label="Extensions"
                value={formatNpr(project.profitability?.extensionsPaisa ?? "0")}
              />
              <div className="border-t pt-2">
                <Row label="Total budget" value={formatNpr(budgetPaisa)} bold />
              </div>
              <Row
                label="Remaining to invoice"
                value={formatNpr(Math.max(0, remainingToInvoice))}
              />
              <Row
                label="VAT"
                value={
                  project.isVatApplicable
                    ? `${project.vatRateApplied ?? 13}% applicable`
                    : "No VAT"
                }
              />
            </CardContent>
          </Card>
          {analytics.lastPaid?.paymentDate ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  Last payment
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {formatNpr(analytics.lastPaid.totalPaisa)} on{" "}
                {toDateKey(analytics.lastPaid.paymentDate)}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      {invoices.length > 0 ? (
        <div>
          <h3 className="mb-4 text-base font-medium">Analytics</h3>
          <InvoiceAnalytics invoices={invoices} />
        </div>
      ) : null}

      <InvoiceFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        project={project}
        budgetPaisa={budgetPaisa}
        invoicedAmountPaisa={analytics.totalAmountPaisa}
        onCreated={() => void load()}
      />
      <InvoiceFormDialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        project={project}
        budgetPaisa={budgetPaisa}
        invoicedAmountPaisa={analytics.totalAmountPaisa}
        invoice={editing}
        onUpdated={() => void load()}
      />
      <MarkPaidDialog
        invoice={paying}
        onClose={() => setPaying(null)}
        onConfirm={markPaid}
      />
    </div>
  )
}

function daysSinceLabel(date: string) {
  return calendarDaysBetween(date, nptTodayIso())
}
