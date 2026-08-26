import * as React from "react"
import { Link, createFileRoute } from "@tanstack/react-router"
import { IconEye, IconSearch } from "@tabler/icons-react"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { InvoiceFormDialog } from "@/components/invoices/invoice-form-dialog"
import { PageHeader } from "@/components/page-header"
import { PaginationBar } from "@/components/pagination-bar"
import { StatusBadge } from "@/components/health-badge"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui-states"
import { AUDIT_ROLES } from "@/lib/access"
import {
  NavigableTableRow,
  TableActionLink,
  TableActionsCell,
  TableActionsHead,
} from "@/components/table-row-actions"
import { api, ApiError } from "@/lib/api"
import type { PaginatedEnvelope } from "@/lib/api"
import { formatJoinedDate } from "@/lib/dates"
import { isInvoiceOverdue } from "@/lib/invoice-analytics"
import {
  buildListQuery,
  parseListSearch,
  parseOptionalString,
  totalPagesFor,
} from "@/lib/list-query"
import { useAuth } from "@/lib/auth"
import { formatNpr } from "@/lib/money"
import { ClientLink, ProjectLink } from "@/components/resource-link"
import type { Invoice, Project } from "@/lib/types"

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
  const [projects, setProjects] = React.useState<Project[]>([])
  const [total, setTotal] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [formOpen, setFormOpen] = React.useState(false)
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

  React.useEffect(() => {
    void (async () => {
      try {
        const res = await api<PaginatedEnvelope<Project[]>>("/projects")
        setProjects([...res.data].sort((a, b) => a.name.localeCompare(b.name)))
      } catch {
        // Project filter stays empty if load fails
      }
    })()
  }, [])

  const totalPages = totalPagesFor(total, pageSize)
  const hasFilters = Boolean(q || status || projectId || from || to)
  const projectItems = React.useMemo(
    () => Object.fromEntries(projects.map((p) => [p.id, p.name])),
    [projects],
  )

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
            <Select
              value={projectId || null}
              onValueChange={(v) => {
                void navigate({
                  search: (prev) => ({
                    ...prev,
                    projectId: v || undefined,
                    page: 1,
                  }),
                })
              }}
              items={projectItems}
            >
              <SelectTrigger className="w-52">
                <SelectValue placeholder="All projects" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              From
            </span>
            <Input
              type="date"
              className="w-40"
              value={from ?? ""}
              onChange={(e) => {
                void navigate({
                  search: (prev) => ({
                    ...prev,
                    from: e.target.value || undefined,
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
            <Input
              type="date"
              className="w-40"
              value={to ?? ""}
              onChange={(e) => {
                void navigate({
                  search: (prev) => ({
                    ...prev,
                    to: e.target.value || undefined,
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
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Project</TableHead>
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
                      <TableCell className="whitespace-nowrap">
                        {formatJoinedDate(invoice.invoiceDate)}
                      </TableCell>
                      <TableCell>
                        <div className="tabular-nums font-medium">
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
                          ? formatJoinedDate(invoice.paymentDate)
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
                      </TableActionsCell>
                    </NavigableTableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
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
    </div>
  )
}
