import * as React from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconPencil,
  IconTrash,
} from "@tabler/icons-react"
import {
  Alert,
  AlertDescription,
} from "@workspace/ui/components/alert"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Separator } from "@workspace/ui/components/separator"
import { useConfirmDialog } from "@/components/confirm-dialog"
import { StatusBadge } from "@/components/health-badge"
import { InvoiceFormDialog } from "@/components/invoices/invoice-form-dialog"
import { MarkPaidDialog } from "@/components/invoices/mark-paid-dialog"
import { PageHeader } from "@/components/page-header"
import { ClientLink, ProjectLink } from "@/components/resource-link"
import { ErrorState, LoadingState } from "@/components/ui-states"
import { AUDIT_ROLES } from "@/lib/access"
import { api, ApiError } from "@/lib/api"
import type { Envelope, PaginatedEnvelope } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { toDateKey } from "@/lib/dates"
import {
  OVERDUE_AFTER_DAYS,
  calendarDaysBetween,
  computeInvoiceAnalytics,
  daysSinceInvoice,
  invoiceDateKey,
  isInvoiceOverdue,
  paisaNumber,
} from "@/lib/invoice-analytics"
import { DEFAULT_INVOICE_LIST_SEARCH } from "@/routes/_app/invoices/index"
import { formatNpr } from "@/lib/money"
import type { Invoice, Project } from "@/lib/types"

export const Route = createFileRoute("/_app/invoices/$id")({
  component: InvoiceDetailPage,
})

function DetailRow({
  label,
  value,
  bold,
}: {
  label: string
  value: React.ReactNode
  bold?: boolean
}) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className={bold ? "font-medium" : "text-muted-foreground"}>
        {label}
      </span>
      <span className={bold ? "text-right font-semibold" : "text-right"}>
        {value}
      </span>
    </div>
  )
}

function StatRow({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: string
}) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={accent ?? "font-medium"}>{value}</span>
    </div>
  )
}

function InvoiceDetailPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { confirm, dialog } = useConfirmDialog()
  const canMutate = Boolean(
    user?.role && (AUDIT_ROLES as string[]).includes(user.role),
  )

  const [invoice, setInvoice] = React.useState<Invoice | null>(null)
  const [siblings, setSiblings] = React.useState<Invoice[]>([])
  const [project, setProject] = React.useState<Project | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [paying, setPaying] = React.useState(false)
  const [editing, setEditing] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const invoiceRes = await api<Envelope<Invoice>>(`/invoices/${id}`)
      const current = invoiceRes.data
      setInvoice(current)
      const [invoicesRes, projectRes] = await Promise.all([
        api<PaginatedEnvelope<Invoice[]>>(
          `/invoices?projectId=${encodeURIComponent(current.projectId)}`,
        ),
        api<Envelope<Project>>(`/projects/${current.projectId}`).catch(
          () => null,
        ),
      ])
      setSiblings(invoicesRes.data)
      setProject(projectRes?.data ?? null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load invoice")
    } finally {
      setLoading(false)
    }
  }, [id])

  React.useEffect(() => {
    void load()
  }, [load])

  if (loading) return <LoadingState />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (!invoice) return null

  const current = invoice
  const overdue = isInvoiceOverdue(current)
  const client =
    current.client ?? current.project?.client ?? project?.client
  const daysIssued = daysSinceInvoice(current.invoiceDate)

  const sorted = [...siblings].sort((a, b) =>
    invoiceDateKey(a.invoiceDate).localeCompare(invoiceDateKey(b.invoiceDate)),
  )
  const idx = sorted.findIndex((row) => row.id === current.id)
  const upTo = idx >= 0 ? sorted.slice(0, idx + 1) : [current]
  const thisAmount = paisaNumber(current.amountPaisa)
  const cumulative = upTo.reduce(
    (sum, row) => sum + paisaNumber(row.amountPaisa),
    0,
  )
  const totalAmount = sorted.reduce(
    (sum, row) => sum + paisaNumber(row.amountPaisa),
    0,
  )
  const budgetPaisa =
    project?.profitability?.contractedRevenuePaisa ??
    project?.profitability?.revenuePaisa ??
    project?.budgetPaisa ??
    current.project?.budgetPaisa ??
    "0"
  const writtenOffPaisa = project?.profitability?.writtenOffPaisa ?? "0"
  const budget = paisaNumber(budgetPaisa)
  const pctOfBudget = budget > 0 ? (thisAmount / budget) * 100 : 0
  const pctOfInvoiced = totalAmount > 0 ? (thisAmount / totalAmount) * 100 : 0
  const remainingAfter = budget - cumulative
  const analytics = computeInvoiceAnalytics(sorted)
  const daysToPayment =
    current.status === "paid" && current.paymentDate
      ? calendarDaysBetween(current.invoiceDate, current.paymentDate)
      : null
  const daysSincePrev =
    idx > 0
      ? calendarDaysBetween(sorted[idx - 1].invoiceDate, current.invoiceDate)
      : null

  async function markPaid(paymentDate: string) {
    try {
      await api<Envelope<Invoice>>(`/invoices/${id}/mark-paid`, {
        method: "POST",
        body: { paymentDate },
      })
      await load()
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "Failed to mark invoice paid")
      throw e
    }
  }

  async function deleteInvoice() {
    const ok = await confirm({
      title: "Delete this invoice?",
      description: `Invoice ${current.invoiceNumber} for ${formatNpr(current.totalPaisa)} will be permanently deleted.`,
      confirmLabel: "Delete",
      destructive: true,
    })
    if (!ok) return
    try {
      await api(`/invoices/${current.id}`, { method: "DELETE" })
      void navigate({ to: "/invoices", search: DEFAULT_INVOICE_LIST_SEARCH })
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "Delete failed")
    }
  }

  return (
    <div>
      {dialog}
      <PageHeader
        title={invoice.invoiceNumber}
        breadcrumbs={[
          { label: "Invoices", to: "/invoices", search: DEFAULT_INVOICE_LIST_SEARCH },
          { label: invoice.invoiceNumber },
        ]}
        description={
          invoice.project?.id ? (
            <>
              <ProjectLink id={invoice.project.id}>
                {invoice.project.name}
              </ProjectLink>
              {client?.id ? (
                <>
                  {" · "}
                  <ClientLink id={client.id}>{client.name}</ClientLink>
                </>
              ) : null}
            </>
          ) : undefined
        }
        status={
          <>
            {invoice.amcId ? <Badge variant="secondary">AMC</Badge> : null}
            <StatusBadge status={invoice.status} />
            {overdue ? (
              <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-200">
                Overdue
              </Badge>
            ) : null}
          </>
        }
        actions={
          canMutate ? (
            <>
              {invoice.status === "pending" ? (
                <>
                  <Button variant="outline" onClick={() => setEditing(true)}>
                    <IconPencil className="size-4" />
                    Edit
                  </Button>
                  <Button variant="outline" onClick={() => setPaying(true)}>
                    <IconCircleCheck className="size-4" />
                    Mark paid
                  </Button>
                </>
              ) : null}
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => void deleteInvoice()}
              >
                <IconTrash className="size-4" />
                Delete
              </Button>
            </>
          ) : null
        }
      />

      {overdue ? (
        <Alert className="mb-6 border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <IconAlertTriangle />
          <AlertDescription className="text-amber-900 dark:text-amber-200">
            This invoice has been unpaid for {daysIssued} days (over the{" "}
            {OVERDUE_AFTER_DAYS}-day limit).
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Invoice Details
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-3">
                <DetailRow
                  label="Invoice Number"
                  value={invoice.invoiceNumber}
                />
                <DetailRow
                  label="Invoice Date"
                  value={toDateKey(invoice.invoiceDate)}
                />
                <DetailRow
                  label="Status"
                  value={invoice.status === "paid" ? "Paid" : "Pending"}
                />
                {invoice.paymentDate ? (
                  <DetailRow
                    label="Payment Date"
                    value={toDateKey(invoice.paymentDate)}
                  />
                ) : null}
                {invoice.notes ? (
                  <DetailRow
                    label="Notes"
                    value={
                      <span className="whitespace-pre-wrap">{invoice.notes}</span>
                    }
                  />
                ) : null}
              </div>
              <Separator />
              <div className="flex flex-col gap-2">
                <DetailRow
                  label="Amount"
                  value={formatNpr(invoice.amountPaisa)}
                />
                <DetailRow
                  label={
                    invoice.vatRateApplied > 0
                      ? `VAT (${invoice.vatRateApplied}%)`
                      : "VAT"
                  }
                  value={
                    paisaNumber(invoice.vatPaisa) > 0
                      ? formatNpr(invoice.vatPaisa)
                      : "Not applicable"
                  }
                />
              </div>
              <Separator />
              <div className="flex justify-between text-lg font-semibold">
                <span>Total</span>
                <span>{formatNpr(invoice.totalPaisa)}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Stats</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <StatRow
                label="% of total budget"
                value={`${pctOfBudget.toFixed(1)}%`}
              />
              <StatRow
                label="% of total invoiced"
                value={`${pctOfInvoiced.toFixed(1)}%`}
              />
              <StatRow
                label="Cumulative invoiced"
                value={formatNpr(cumulative)}
              />
              <StatRow
                label="Remaining budget after"
                value={formatNpr(remainingAfter)}
                accent={remainingAfter < 0 ? "font-medium text-amber-600" : undefined}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Timing</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <StatRow
                label="Days since issued"
                value={`${daysIssued} days`}
              />
              <StatRow
                label="Days to payment"
                value={
                  daysToPayment !== null ? `${daysToPayment} days` : "—"
                }
              />
              {daysSincePrev !== null ? (
                <StatRow
                  label="Days since previous invoice"
                  value={`${daysSincePrev} days`}
                />
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Project Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <StatRow label="Written off" value={formatNpr(writtenOffPaisa)} />
              <StatRow
                label="Total invoiced"
                value={formatNpr(analytics.totalInvoicedPaisa)}
              />
              <StatRow
                label="Total paid"
                value={formatNpr(analytics.totalPaidPaisa)}
              />
              <StatRow
                label="Outstanding"
                value={formatNpr(analytics.outstandingPaisa)}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      <InvoiceFormDialog
        open={editing}
        onOpenChange={setEditing}
        invoice={invoice}
        onUpdated={() => void load()}
      />
      <MarkPaidDialog
        invoice={paying ? invoice : null}
        onClose={() => setPaying(false)}
        onConfirm={markPaid}
      />
    </div>
  )
}
