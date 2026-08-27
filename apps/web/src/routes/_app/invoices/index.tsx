import * as React from "react"
import { createFileRoute } from "@tanstack/react-router"
import { IconSearch } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { DatePicker } from "@/components/datetime-picker"
import { InvoiceFormDialog } from "@/components/invoices/invoice-form-dialog"
import { InvoiceTable } from "@/components/invoices/invoice-table"
import { PageHeader } from "@/components/page-header"
import { PaginationBar } from "@/components/pagination-bar"
import { ProjectCombobox } from "@/components/project-combobox"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui-states"
import { AUDIT_ROLES } from "@/lib/access"
import { api, ApiError } from "@/lib/api"
import type { PaginatedEnvelope } from "@/lib/api"
import {
  buildListQuery,
  parseListSearch,
  parseOptionalString,
  totalPagesFor,
} from "@/lib/list-query"
import { useAuth } from "@/lib/auth"
import type { Invoice } from "@/lib/types"

const INVOICE_STATUSES = ["paid", "unpaid"] as const

type InvoiceListStatus = (typeof INVOICE_STATUSES)[number]

function parseInvoiceStatus(value: unknown): InvoiceListStatus | undefined {
  return INVOICE_STATUSES.includes(value as InvoiceListStatus)
    ? (value as InvoiceListStatus)
    : undefined
}

export const Route = createFileRoute("/_app/invoices/")({
  validateSearch: (search: Record<string, unknown>) => {
    const base = parseListSearch(search)
    const status = parseInvoiceStatus(search.status)
    const projectId = parseOptionalString(search.projectId)
    const from = parseOptionalString(search.from)
    const to = parseOptionalString(search.to)
    return {
      ...base,
      ...(status ? { status } : {}),
      ...(projectId ? { projectId } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    }
  },
  component: InvoicesPage,
})

function InvoicesPage() {
  const navigate = Route.useNavigate()
  const { q, page, pageSize, status, projectId, from, to } = Route.useSearch()
  const { user } = useAuth()
  const canMutate = Boolean(
    user?.role && (AUDIT_ROLES as string[]).includes(user.role),
  )
  const [invoices, setInvoices] = React.useState<Invoice[]>([])
  const [total, setTotal] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [formOpen, setFormOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Invoice | null>(null)
  const [searchInput, setSearchInput] = React.useState(q ?? "")

  React.useEffect(() => {
    setSearchInput(q ?? "")
  }, [q])

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = searchInput.trim() || undefined
      if (next === q) return
      void navigate({
        search: (prev) => ({ ...prev, q: next, page: 1 }),
        replace: true,
      })
    }, 300)
    return () => window.clearTimeout(timer)
  }, [searchInput, q, navigate])

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = buildListQuery({
        q,
        page,
        pageSize,
        status: status || undefined,
        projectId,
        from,
        to,
      })
      const res = await api<PaginatedEnvelope<Invoice[]>>(`/invoices?${qs}`)
      setInvoices(res.data)
      setTotal(res.meta.total)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load invoices")
    } finally {
      setLoading(false)
    }
  }, [q, page, pageSize, status, projectId, from, to])

  React.useEffect(() => {
    void load()
  }, [load])

  const totalPages = totalPagesFor(total, pageSize)
  const hasFilters = Boolean(q || status || projectId || from || to)

  return (
    <div>
      <PageHeader
        title="Invoices"
        description="Billing invoices across projects"
        actions={
          canMutate ? (
            <Button onClick={() => setFormOpen(true)}>New invoice</Button>
          ) : null
        }
      />

      <div className="mb-4 space-y-3">
        <div className="relative max-w-sm">
          <IconSearch className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search invoice number…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Status
            </span>
            <Select
              value={status || null}
              onValueChange={(v) => {
                void navigate({
                  search: (prev) => ({
                    ...prev,
                    status: parseInvoiceStatus(v),
                    page: 1,
                  }),
                })
              }}
              items={{ unpaid: "Unpaid", paid: "Paid" }}
            >
              <SelectTrigger className="w-36">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unpaid">Unpaid</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Project
            </span>
            <ProjectCombobox
              className="w-64"
              value={projectId}
              allowClear
              placeholder="All projects"
              onValueChange={(id) => {
                void navigate({
                  search: (prev) => ({
                    ...prev,
                    projectId: id,
                    page: 1,
                  }),
                })
              }}
            />
          </div>
          <div className="grid gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              From
            </span>
            <DatePicker
              className="w-44"
              value={from}
              clearable
              onChange={(next) => {
                void navigate({
                  search: (prev) => ({
                    ...prev,
                    from: next,
                    page: 1,
                  }),
                })
              }}
            />
          </div>
          <div className="grid gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              To
            </span>
            <DatePicker
              className="w-44"
              value={to}
              clearable
              onChange={(next) => {
                void navigate({
                  search: (prev) => ({
                    ...prev,
                    to: next,
                    page: 1,
                  }),
                })
              }}
            />
          </div>
          {hasFilters ? (
            <Button
              variant="outline"
              onClick={() => {
                void navigate({
                  search: (prev) => ({
                    ...prev,
                    q: undefined,
                    status: undefined,
                    projectId: undefined,
                    from: undefined,
                    to: undefined,
                    page: 1,
                  }),
                })
              }}
            >
              Clear filters
            </Button>
          ) : null}
        </div>
      </div>

      {loading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!loading && invoices.length === 0 ? (
        <EmptyState
          message={hasFilters ? "No invoices match your filters" : "No invoices"}
        />
      ) : null}
      {invoices.length > 0 ? (
        <div className="space-y-4">
          <InvoiceTable
            invoices={invoices}
            canMutate={canMutate}
            onEdit={setEditing}
          />
          <PaginationBar
            page={page}
            totalPages={totalPages}
            total={total}
            pageSize={pageSize}
            onPageChange={(nextPage) => {
              void navigate({
                search: (prev) => ({ ...prev, page: nextPage }),
              })
            }}
            onPageSizeChange={(size) => {
              void navigate({
                search: (prev) => ({ ...prev, pageSize: size, page: 1 }),
              })
            }}
          />
        </div>
      ) : null}

      <InvoiceFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        presetProjectId={projectId}
        onCreated={() => void load()}
      />
      <InvoiceFormDialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        invoice={editing}
        onUpdated={() => void load()}
      />
    </div>
  )
}
