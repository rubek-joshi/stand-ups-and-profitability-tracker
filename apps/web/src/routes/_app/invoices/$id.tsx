import * as React from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { IconCircleCheck, IconTrash } from "@tabler/icons-react"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { useConfirmDialog } from "@/components/confirm-dialog"
import { StatusBadge } from "@/components/health-badge"
import { MarkPaidDialog } from "@/components/invoices/mark-paid-dialog"
import { PageHeader } from "@/components/page-header"
import { ClientLink, ProjectLink } from "@/components/resource-link"
import { ErrorState, LoadingState } from "@/components/ui-states"
import { AUDIT_ROLES } from "@/lib/access"
import { api, ApiError } from "@/lib/api"
import type { Envelope } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { formatJoinedDate } from "@/lib/dates"
import { isInvoiceOverdue, paisaNumber } from "@/lib/invoice-analytics"
import { DEFAULT_LIST_SEARCH } from "@/lib/list-query"
import { formatNpr } from "@/lib/money"
import type { Invoice } from "@/lib/types"

export const Route = createFileRoute("/_app/invoices/$id")({
  component: InvoiceDetailPage,
})

function Row({
  label,
  value,
  bold,
}: {
  label: string
  value: React.ReactNode
  bold?: boolean
}) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className={bold ? "font-medium" : "text-muted-foreground"}>{label}</span>
      <span className={bold ? "font-semibold text-right" : "text-right"}>{value}</span>
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
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [paying, setPaying] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api<Envelope<Invoice>>(`/invoices/${id}`)
      setInvoice(res.data)
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
  const client = current.project?.client

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
      void navigate({ to: "/invoices", search: DEFAULT_LIST_SEARCH })
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
          { label: "Invoices", to: "/invoices", search: DEFAULT_LIST_SEARCH },
          { label: invoice.invoiceNumber },
        ]}
        status={
          <>
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
                <Button variant="outline" onClick={() => setPaying(true)}>
                  <IconCircleCheck className="size-4" />
                  Mark paid
                </Button>
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

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Amounts</CardTitle>
          </CardHeader>
          <CardContent>
            <Row label="Amount (ex-VAT)" value={formatNpr(invoice.amountPaisa)} />
            <Row
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
            <div className="border-t mt-1 pt-1">
              <Row label="Total" value={formatNpr(invoice.totalPaisa)} bold />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Details</CardTitle>
          </CardHeader>
          <CardContent>
            <Row
              label="Project"
              value={
                invoice.project?.id ? (
                  <ProjectLink id={invoice.project.id}>
                    {invoice.project.name}
                  </ProjectLink>
                ) : (
                  "—"
                )
              }
            />
            <Row
              label="Client"
              value={
                client?.id ? (
                  <ClientLink id={client.id}>{client.name}</ClientLink>
                ) : (
                  "—"
                )
              }
            />
            <Row
              label="Invoice date"
              value={formatJoinedDate(invoice.invoiceDate)}
            />
            <Row
              label="Payment date"
              value={
                invoice.paymentDate
                  ? formatJoinedDate(invoice.paymentDate)
                  : "—"
              }
            />
          </CardContent>
        </Card>
      </div>

      {invoice.notes ? (
        <Card className="mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Notes</CardTitle>
          </CardHeader>
          <CardContent className="whitespace-pre-wrap text-sm">
            {invoice.notes}
          </CardContent>
        </Card>
      ) : null}

      <MarkPaidDialog
        invoice={paying ? invoice : null}
        onClose={() => setPaying(false)}
        onConfirm={markPaid}
      />
    </div>
  )
}
