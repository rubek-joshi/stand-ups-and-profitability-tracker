import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  IconAlertTriangle,
  IconCalendarOff,
  IconCircleCheck,
  IconPlus,
  IconReceipt,
  IconTrash,
} from "@tabler/icons-react"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
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
import { MarkPaidDialog } from "@/components/invoices/mark-paid-dialog"
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
import { formatJoinedDate } from "@/lib/dates"
import { formatNpr } from "@/lib/money"
import { nptTodayIso } from "@/lib/standup-age"
import type { Invoice, Project } from "@/lib/types"

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
        <div className={`mt-1 text-xl font-semibold ${accent ?? ""}`}>{value}</div>
        {sub ? <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div> : null}
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
      <span className={bold ? "font-medium" : "text-muted-foreground"}>{label}</span>
      <span className={bold ? "font-semibold" : ""}>{value}</span>
    </div>
  )
}

export function ProjectInvoicesTab({
  project,
  canMutate,
}: {
  project: Project
  canMutate: boolean
}) {
  const { confirm, dialog } = useConfirmDialog()
  const [invoices, setInvoices] = React.useState<Invoice[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [formOpen, setFormOpen] = React.useState(false)
  const [paying, setPaying] = React.useState<Invoice | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api<PaginatedEnvelope<Invoice[]>>(
        `/invoices?projectId=${encodeURIComponent(project.id)}`,
      )
      setInvoices(res.data)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load invoices")
    } finally {
      setLoading(false)
    }
  }, [project.id])

  React.useEffect(() => {
    void load()
  }, [load])

  const analytics = computeInvoiceAnalytics(invoices)
  const budgetPaisa =
    project.profitability?.revenuePaisa ?? project.budgetPaisa
  const budget = paisaNumber(budgetPaisa)
  const remainingToInvoice = budget - analytics.totalAmountPaisa
  const stale = isInvoiceListStale(invoices)

  async function markPaid(paymentDate: string) {
    if (!paying) return
    try {
      await api<Envelope<Invoice>>(`/invoices/${paying.id}/mark-paid`, {
        method: "POST",
        body: { paymentDate },
      })
      await load()
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to mark invoice paid")
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
              <span>No invoice issued for this project in the last 30 days.</span>
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
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-medium">Invoice history</h3>
            {analytics.lastInvoice ? (
              <span className="text-xs text-muted-foreground">
                Last invoice: {formatJoinedDate(analytics.lastInvoice.invoiceDate)}
              </span>
            ) : null}
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
            <div className="space-y-2">
              {[...invoices]
                .sort((a, b) =>
                  String(b.invoiceDate).localeCompare(String(a.invoiceDate)),
                )
                .map((invoice) => {
                  const overdue = isInvoiceOverdue(invoice)
                  return (
                    <Card key={invoice.id}>
                      <CardContent className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              to="/invoices/$id"
                              params={{ id: invoice.id }}
                              className="font-medium hover:underline"
                            >
                              {invoice.invoiceNumber}
                            </Link>
                            <StatusBadge status={invoice.status} />
                            {overdue ? (
                              <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-200">
                                Overdue
                              </Badge>
                            ) : null}
                          </div>
                          <div className="mt-1 text-sm text-muted-foreground">
                            {formatJoinedDate(invoice.invoiceDate)}
                            {invoice.status === "paid" && invoice.paymentDate ? (
                              <span className="ml-2">
                                · Paid {formatJoinedDate(invoice.paymentDate)}
                                <span className="ml-1 text-xs">
                                  (
                                  {calendarDaysBetween(
                                    invoice.invoiceDate,
                                    invoice.paymentDate,
                                  )}
                                  d)
                                </span>
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className="text-sm text-muted-foreground">
                              {formatNpr(invoice.amountPaisa)}
                              {paisaNumber(invoice.vatPaisa) > 0 ? (
                                <span className="text-xs">
                                  {" "}
                                  +{formatNpr(invoice.vatPaisa)} VAT
                                </span>
                              ) : null}
                            </div>
                            <div className="font-semibold">
                              {formatNpr(invoice.totalPaisa)}
                            </div>
                            {budget > 0 ? (
                              <div className="text-xs text-muted-foreground">
                                {(
                                  (paisaNumber(invoice.amountPaisa) / budget) *
                                  100
                                ).toFixed(1)}
                                % of budget
                              </div>
                            ) : null}
                          </div>
                          {canMutate ? (
                            <div className="flex flex-col gap-1.5">
                              {invoice.status === "pending" ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setPaying(invoice)}
                                >
                                  <IconCircleCheck className="size-4" />
                                  Mark paid
                                </Button>
                              ) : null}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive hover:text-destructive"
                                onClick={() => void deleteInvoice(invoice)}
                              >
                                <IconTrash className="size-4" />
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Budget breakdown</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row
                label="Quoted budget"
                value={formatNpr(project.profitability?.budgetPaisa ?? project.budgetPaisa)}
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
                <CardTitle className="text-sm font-medium">Last payment</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {formatNpr(analytics.lastPaid.totalPaisa)} on{" "}
                {formatJoinedDate(analytics.lastPaid.paymentDate)}
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
