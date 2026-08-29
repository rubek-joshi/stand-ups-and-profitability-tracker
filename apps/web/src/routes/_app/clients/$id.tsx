import * as React from "react"
import { Link, createFileRoute } from "@tanstack/react-router"
import {
  IconDotsVertical,
  IconEye,
  IconPencil,
  IconPlus,
  IconTrash,
  IconUserOff,
} from "@tabler/icons-react"
import { formatDistanceStrict, isBefore, parseISO, startOfDay } from "date-fns"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
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
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { DatePicker } from "@/components/datetime-picker"
import { InvoiceFormDialog } from "@/components/invoices/invoice-form-dialog"
import { InvoiceTable } from "@/components/invoices/invoice-table"
import { ListViewToggle } from "@/components/list-view-toggle"
import { PageHeader } from "@/components/page-header"
import { PaginationBar } from "@/components/pagination-bar"
import { HealthBadge, StatusBadge } from "@/components/health-badge"
import { MailLink, TelLink } from "@/components/contact-link"
import { CreateProjectDialog } from "@/components/create-project-dialog"
import { useConfirmDialog } from "@/components/confirm-dialog"
import { ProjectCombobox } from "@/components/project-combobox"
import {
  NavigableTableRow,
  TableActionLink,
  TableActionsCell,
  TableActionsHead,
} from "@/components/table-row-actions"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui-states"
import { AUDIT_ROLES } from "@/lib/access"
import { api, ApiError } from "@/lib/api"
import type { Envelope, PaginatedEnvelope } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import {
  DEFAULT_LIST_SEARCH,
  buildListQuery,
  clampPage,
  parseListSearch,
  parseOptionalString,
  totalPagesFor,
} from "@/lib/list-query"
import { formatNpr, paisaToNpr } from "@/lib/money"
import type { Client, Invoice, OrgSettings, Project } from "@/lib/types"
import { getStoredView, parseListView, setStoredView } from "@/lib/view-pref"

const CLIENT_TABS = ["projects", "invoices"] as const
const PROJECT_FILTERS = ["all", "open", "closed"] as const
const INVOICE_STATUSES = ["paid", "unpaid"] as const
const CLIENT_PROJECTS_VIEW_KEY = "pt_client_projects_view"

type ClientTab = (typeof CLIENT_TABS)[number]
type ProjectFilter = (typeof PROJECT_FILTERS)[number]
type InvoiceListStatus = (typeof INVOICE_STATUSES)[number]

function parseClientTab(value: unknown): ClientTab {
  return CLIENT_TABS.includes(value as ClientTab) ? (value as ClientTab) : "projects"
}

function parseProjectFilter(value: unknown): ProjectFilter | undefined {
  return PROJECT_FILTERS.includes(value as ProjectFilter)
    ? (value as ProjectFilter)
    : undefined
}

function parseInvoiceStatus(value: unknown): InvoiceListStatus | undefined {
  return INVOICE_STATUSES.includes(value as InvoiceListStatus)
    ? (value as InvoiceListStatus)
    : undefined
}

export const Route = createFileRoute("/_app/clients/$id")({
  validateSearch: (search: Record<string, unknown>) => {
    const { page, pageSize } = parseListSearch(search)
    const tab = search.tab === undefined ? undefined : parseClientTab(search.tab)
    const view = parseListView(search.view)
    const projectStatus = parseProjectFilter(search.projectStatus)
    const status = parseInvoiceStatus(search.status)
    const projectId = parseOptionalString(search.projectId)
    const from = parseOptionalString(search.from)
    const to = parseOptionalString(search.to)
    return {
      ...(page !== DEFAULT_LIST_SEARCH.page ? { page } : {}),
      ...(pageSize !== DEFAULT_LIST_SEARCH.pageSize ? { pageSize } : {}),
      ...(tab && tab !== "projects" ? { tab } : {}),
      ...(view && view !== "card" ? { view } : {}),
      ...(projectStatus && projectStatus !== "all" ? { projectStatus } : {}),
      ...(status ? { status } : {}),
      ...(projectId ? { projectId } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    }
  },
  component: ClientDetailPage,
})

function isClosedProject(project: Project) {
  return project.status === "closed"
}

type InvolvedPerson = { id: string; name: string }

function ClientDetailPage() {
  const { id } = Route.useParams()
  const navigate = Route.useNavigate()
  const {
    tab = "projects",
    page = DEFAULT_LIST_SEARCH.page,
    pageSize = DEFAULT_LIST_SEARCH.pageSize,
    view = "card",
    projectStatus = "all",
    status,
    projectId,
    from,
    to,
  } = Route.useSearch()
  const { user } = useAuth()
  const canMutateInvoices = Boolean(
    user?.role && (AUDIT_ROLES as string[]).includes(user.role),
  )
  const { confirm, dialog } = useConfirmDialog()
  const [client, setClient] = React.useState<Client | null>(null)
  const [settings, setSettings] = React.useState<OrgSettings | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [invoiceFormOpen, setInvoiceFormOpen] = React.useState(false)
  const [editingInvoice, setEditingInvoice] = React.useState<Invoice | null>(null)
  const [invoices, setInvoices] = React.useState<Invoice[]>([])
  const [invoiceTotal, setInvoiceTotal] = React.useState(0)
  const [invoicesLoading, setInvoicesLoading] = React.useState(false)
  const [invoicesError, setInvoicesError] = React.useState<string | null>(null)
  const [peopleModal, setPeopleModal] = React.useState<{
    title: string
    people: InvolvedPerson[]
    emptyLabel: string
    href: "/employees/$id" | "/core-members/$id"
  } | null>(null)

  React.useLayoutEffect(() => {
    if (view === "table") {
      setStoredView(CLIENT_PROJECTS_VIEW_KEY, "table")
      return
    }
    if (getStoredView(CLIENT_PROJECTS_VIEW_KEY) !== "table") return
    void navigate({
      search: (prev) => ({ ...prev, view: "table" }),
      replace: true,
      resetScroll: false,
    })
  }, [])

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [clientRes, settingsRes] = await Promise.all([
        api<Envelope<Client>>(`/clients/${id}`),
        api<Envelope<OrgSettings>>("/settings").catch(() => null),
      ])
      setClient(clientRes.data)
      setSettings(settingsRes?.data ?? null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load client")
    } finally {
      setLoading(false)
    }
  }, [id])

  React.useEffect(() => {
    void load()
  }, [load])

  const loadInvoices = React.useCallback(async () => {
    if (tab !== "invoices") return
    setInvoicesLoading(true)
    setInvoicesError(null)
    try {
      const qs = buildListQuery({
        clientId: id,
        page,
        pageSize,
        status: status || undefined,
        projectId,
        from,
        to,
      })
      const res = await api<PaginatedEnvelope<Invoice[]>>(`/invoices?${qs}`)
      setInvoices(res.data)
      setInvoiceTotal(res.meta.total)
    } catch (e) {
      setInvoicesError(
        e instanceof ApiError ? e.message : "Failed to load invoices",
      )
    } finally {
      setInvoicesLoading(false)
    }
  }, [id, tab, page, pageSize, status, projectId, from, to])

  React.useEffect(() => {
    void loadInvoices()
  }, [loadInvoices])

  const setView = (next: "card" | "table") => {
    setStoredView(CLIENT_PROJECTS_VIEW_KEY, next)
    void navigate({
      search: (prev) => ({
        ...prev,
        view: next === "card" ? undefined : next,
      }),
      replace: true,
      resetScroll: false,
    })
  }

  if (loading) return <LoadingState />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (!client) return null

  const canDelete = (client._count?.projects ?? client.projects?.length ?? 0) === 0
  const projects = client.projects ?? []
  const filteredProjects = projects.filter((project) => {
    if (projectStatus === "open") return !isClosedProject(project)
    if (projectStatus === "closed") return isClosedProject(project)
    return true
  })
  const projectTotalPages = totalPagesFor(filteredProjects.length, pageSize)
  const projectPage = clampPage(page, projectTotalPages)
  const pagedProjects = filteredProjects.slice(
    (projectPage - 1) * pageSize,
    projectPage * pageSize,
  )
  const invoiceTotalPages = totalPagesFor(invoiceTotal, pageSize)
  const stats = client.stats
  const totalPl = paisaToNpr(stats?.profitLossPaisa)
  const employees = Array.isArray(stats?.employeesInvolved)
    ? stats.employeesInvolved
    : []
  const coreMembers = Array.isArray(stats?.coreMembersInvolved)
    ? stats.coreMembersInvolved
    : []

  return (
    <div>
      <PageHeader
        title={client.name}
        description="Client detail"
        breadcrumbs={[
          { label: "Clients", to: "/clients", search: DEFAULT_LIST_SEARCH },
          { label: client.name },
        ]}
        status={<StatusBadge status={client.status} />}
        actions={
          <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Client actions"
                  />
                }
              >
                <IconDotsVertical />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-40">
                <DropdownMenuGroup>
                  {client.status === "active" ? (
                    <DropdownMenuItem
                      onClick={async () => {
                        const ok = await confirm({
                          title: "Deactivate client?",
                          description: "The client will be marked inactive.",
                          confirmLabel: "Deactivate",
                          destructive: true,
                        })
                        if (!ok) return
                        await api(`/clients/${id}/deactivate`, { method: "POST" })
                        await load()
                      }}
                    >
                      <IconUserOff />
                      Deactivate
                    </DropdownMenuItem>
                  ) : null}
                  {canDelete ? (
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={async () => {
                        const ok = await confirm({
                          title: "Delete client?",
                          description: "This permanently deletes the client.",
                          confirmLabel: "Delete",
                          destructive: true,
                        })
                        if (!ok) return
                        try {
                          await api(`/clients/${id}`, { method: "DELETE" })
                          void navigate({
                            to: "/clients",
                            search: DEFAULT_LIST_SEARCH,
                          })
                        } catch (e) {
                          alert(
                            e instanceof ApiError ? e.message : "Delete failed",
                          )
                        }
                      }}
                    >
                      <IconTrash />
                      Delete
                    </DropdownMenuItem>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger
                        render={<div className="w-full cursor-not-allowed" />}
                      >
                        <DropdownMenuItem disabled variant="destructive">
                          <IconTrash />
                          Delete
                        </DropdownMenuItem>
                      </TooltipTrigger>
                      <TooltipContent>
                        Cannot delete: client has projects
                      </TooltipContent>
                    </Tooltip>
                  )}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <section className="min-w-0 space-y-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title="Project profit / loss"
              value={formatNpr(stats?.profitLossPaisa ?? "0", { signed: true })}
              subtitle={
                stats?.contractedProfitLossPaisa
                  ? `Contracted: ${formatNpr(stats.contractedProfitLossPaisa, { signed: true })}`
                  : undefined
              }
              valueClassName={
                totalPl > 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : totalPl < 0
                    ? "text-red-600 dark:text-red-400"
                    : undefined
              }
            />
            <StatCard
              title="Employees involved"
              value={String(employees.length)}
              interactive
              onClick={() =>
                setPeopleModal({
                  title: "Employees involved",
                  people: employees,
                  emptyLabel: "No employees assigned to this client's projects.",
                  href: "/employees/$id",
                })
              }
            />
            <StatCard
              title="Core members involved"
              value={String(coreMembers.length)}
              interactive
              onClick={() =>
                setPeopleModal({
                  title: "Core members involved",
                  people: coreMembers,
                  emptyLabel: "No core members assigned to this client's projects.",
                  href: "/core-members/$id",
                })
              }
            />
            <StatCard
              title="Stand-ups mentioned"
              value={String(stats?.standupsMentioned ?? 0)}
            />
          </div>

          <Tabs
            value={tab}
            onValueChange={(next) => {
              void navigate({
                search: (prev) => ({
                  ...prev,
                  tab: next === "invoices" ? "invoices" : undefined,
                  page: 1,
                }),
              })
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <TabsList>
                <TabsTrigger value="projects">
                  Projects ({projects.length})
                </TabsTrigger>
                <TabsTrigger value="invoices">Invoices</TabsTrigger>
              </TabsList>
              {tab === "projects" ? (
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  Add project
                </Button>
              ) : canMutateInvoices ? (
                <Button size="sm" onClick={() => setInvoiceFormOpen(true)}>
                  <IconPlus className="size-4" />
                  New invoice
                </Button>
              ) : null}
            </div>
          </Tabs>

          {tab === "projects" ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="grid gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    Status
                  </span>
                  <Select
                    value={projectStatus}
                    onValueChange={(value) => {
                      const next = parseProjectFilter(value) ?? "all"
                      void navigate({
                        search: (prev) => ({
                          ...prev,
                          projectStatus: next === "all" ? undefined : next,
                          page: 1,
                        }),
                      })
                    }}
                    items={{ all: "All", open: "Open", closed: "Closed" }}
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {filteredProjects.length > 0 ? (
                  <ListViewToggle view={view} onChange={setView} />
                ) : null}
              </div>
              {filteredProjects.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-sm text-muted-foreground">
                    {projects.length === 0
                      ? "No projects for this client."
                      : "No projects match this filter."}
                  </CardContent>
                </Card>
              ) : view === "table" ? (
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Health</TableHead>
                        <TableHead>Budget</TableHead>
                        <TableHead>P/L</TableHead>
                        <TableActionsHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagedProjects.map((project) => {
                        const profit = project.profitability
                        return (
                          <NavigableTableRow
                            key={project.id}
                            to="/projects/$id"
                            params={{ id: project.id }}
                          >
                            <TableCell className="font-medium">
                              {project.name}
                            </TableCell>
                            <TableCell>
                              <StatusBadge status={project.status} />
                            </TableCell>
                            <TableCell>
                              {profit ? (
                                <HealthBadge
                                  marginPercent={profit.marginPercent}
                                  settings={settings}
                                />
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            <TableCell className="tabular-nums">
                              {formatNpr(project.budgetPaisa)}
                            </TableCell>
                            <TableCell className="tabular-nums">
                              {profit ? (
                                <div>
                                  <div className="font-medium">
                                    {formatNpr(profit.profitLossPaisa, {
                                      signed: true,
                                    })}
                                  </div>
                                  {profit.contractedProfitLossPaisa ? (
                                    <div className="text-xs text-muted-foreground">
                                      Contracted:{" "}
                                      {formatNpr(
                                        profit.contractedProfitLossPaisa,
                                        { signed: true }
                                      )}
                                    </div>
                                  ) : null}
                                </div>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            <TableActionsCell>
                              <TableActionLink
                                label="View"
                                to="/projects/$id"
                                params={{ id: project.id }}
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
              ) : (
                <div className="grid gap-4 xl:grid-cols-1 2xl:grid-cols-2 3xl:grid-cols-3">
                  {pagedProjects.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      settings={settings}
                    />
                  ))}
                </div>
              )}
              {filteredProjects.length > 0 ? (
                <PaginationBar
                  page={projectPage}
                  totalPages={projectTotalPages}
                  total={filteredProjects.length}
                  pageSize={pageSize}
                  onPageChange={(nextPage) => {
                    void navigate({
                      search: (prev) => ({ ...prev, page: nextPage }),
                    })
                  }}
                  onPageSizeChange={(size) => {
                    void navigate({
                      search: (prev) => ({
                        ...prev,
                        pageSize: size,
                        page: 1,
                      }),
                    })
                  }}
                />
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="grid gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    Project
                  </span>
                  <ProjectCombobox
                    className="w-64"
                    clientId={id}
                    value={projectId}
                    allowClear
                    placeholder="All client projects"
                    onValueChange={(next) => {
                      void navigate({
                        search: (prev) => ({
                          ...prev,
                          projectId: next,
                          page: 1,
                        }),
                      })
                    }}
                  />
                </div>
                <div className="grid gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    Status
                  </span>
                  <Select
                    value={status || null}
                    onValueChange={(value) => {
                      void navigate({
                        search: (prev) => ({
                          ...prev,
                          status: parseInvoiceStatus(value),
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
              </div>
              {invoicesLoading ? <LoadingState /> : null}
              {invoicesError ? (
                <ErrorState message={invoicesError} onRetry={loadInvoices} />
              ) : null}
              {!invoicesLoading && invoices.length === 0 ? (
                <EmptyState message="No invoices for this client." />
              ) : null}
              {invoices.length > 0 ? (
                <>
                  <InvoiceTable
                    invoices={invoices}
                    canMutate={canMutateInvoices}
                    onEdit={setEditingInvoice}
                  />
                  <PaginationBar
                    page={page}
                    totalPages={invoiceTotalPages}
                    total={invoiceTotal}
                    pageSize={pageSize}
                    onPageChange={(nextPage) => {
                      void navigate({
                        search: (prev) => ({ ...prev, page: nextPage }),
                      })
                    }}
                    onPageSizeChange={(size) => {
                      void navigate({
                        search: (prev) => ({
                          ...prev,
                          pageSize: size,
                          page: 1,
                        }),
                      })
                    }}
                  />
                </>
              ) : null}
            </div>
          )}
        </section>

        <aside className="lg:sticky lg:top-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">Client details</CardTitle>
              <TableActionLink
                label="Edit details"
                to="/clients/$id/edit"
                params={{ id }}
              >
                <IconPencil className="size-3.5" />
              </TableActionLink>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <Detail label="Name" value={client.name} />
              <Detail
                label="Email"
                value={
                  client.email ? <MailLink value={client.email} withCopy /> : "—"
                }
              />
              <Detail
                label="Phone"
                value={
                  client.phone ? <TelLink value={client.phone} withCopy /> : "—"
                }
              />
              <Detail
                label="Additional info"
                value={
                  <p className="whitespace-pre-wrap">
                    {client.additionalInfo?.trim() ||
                      client.contactInfo?.trim() ||
                      "—"}
                  </p>
                }
              />
            </CardContent>
          </Card>
        </aside>
      </div>
      <CreateProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultClientId={client.id}
        defaultClientName={client.name}
        lockClient
        onCreated={() => load()}
      />
      <InvoiceFormDialog
        open={invoiceFormOpen}
        onOpenChange={setInvoiceFormOpen}
        clientId={id}
        presetProjectId={projectId}
        onCreated={() => void loadInvoices()}
      />
      <InvoiceFormDialog
        open={Boolean(editingInvoice)}
        onOpenChange={(open) => {
          if (!open) setEditingInvoice(null)
        }}
        invoice={editingInvoice}
        clientId={id}
        onUpdated={() => void loadInvoices()}
      />
      <Dialog
        open={Boolean(peopleModal)}
        onOpenChange={(open) => {
          if (!open) setPeopleModal(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{peopleModal?.title}</DialogTitle>
          </DialogHeader>
          {peopleModal ? (
            peopleModal.people.length === 0 ? (
              <p className="text-sm text-muted-foreground">{peopleModal.emptyLabel}</p>
            ) : (
              <ul className="max-h-80 space-y-1 overflow-y-auto">
                {peopleModal.people.map((person) => (
                  <li key={person.id}>
                    <Link
                      to={peopleModal.href}
                      params={{ id: person.id }}
                      className="block rounded-md px-2 py-2 text-sm font-medium hover:bg-muted"
                      onClick={() => setPeopleModal(null)}
                    >
                      {person.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </DialogContent>
      </Dialog>
      {dialog}
    </div>
  )
}

function ProjectCard({
  project,
  settings,
}: {
  project: Project
  settings: OrgSettings | null
}) {
  const profit = project.profitability
  const pl = profit ? paisaToNpr(profit.profitLossPaisa) : 0
  const duration = projectDurationSoFar(project.startDate, project.endDate)
  const categories =
    project.categories?.map((c) => c.name).filter(Boolean).join(", ") || "—"

  return (
    <Link
      to="/projects/$id"
      params={{ id: project.id }}
      className="block rounded-xl outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card className="h-full hover:bg-muted/40">
        <CardHeader className="space-y-3 pb-3">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="line-clamp-2 text-base leading-snug">
              {project.name}
            </CardTitle>
            {profit ? (
              <HealthBadge marginPercent={profit.marginPercent} settings={settings} />
            ) : null}
          </div>
          <p className="line-clamp-1 text-xs text-muted-foreground">{categories}</p>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            {project.amcRecord ? (
              <span className="inline-flex items-center gap-1.5 text-xs">
                <span className="text-muted-foreground">AMC</span>
                <StatusBadge status={project.amcRecord.status} />
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">No AMC</span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
            <Meta label="Timeline">
              {String(project.startDate).slice(0, 10)} →{" "}
              {project.endDate
                ? String(project.endDate).slice(0, 10)
                : "Ongoing"}
            </Meta>
            {duration ? <Meta label="Duration so far">{duration}</Meta> : null}
            <Meta label="Extensions">{String(project.extensionCount ?? 0)}</Meta>
            <Meta label="Budget">{formatNpr(project.budgetPaisa)}</Meta>
          </div>

          {profit ? (
            <div className="space-y-1 border-t pt-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-muted-foreground">Realized P&L</span>
                <span
                  className={`tabular-nums text-sm font-semibold ${
                    pl > 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : pl < 0
                        ? "text-red-600 dark:text-red-400"
                        : "text-muted-foreground"
                  }`}
                >
                  {formatNpr(profit.profitLossPaisa, { signed: true })}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    ({profit.marginPercent.toFixed(1)}%)
                  </span>
                </span>
              </div>
              {profit.contractedProfitLossPaisa ? (
                <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                  <span>Contracted</span>
                  <span className="tabular-nums">
                    {formatNpr(profit.contractedProfitLossPaisa, {
                      signed: true,
                    })}
                    {profit.contractedMarginPercent !== undefined
                      ? ` (${profit.contractedMarginPercent.toFixed(1)}%)`
                      : ""}
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </Link>
  )
}

function StatCard({
  title,
  value,
  subtitle,
  valueClassName,
  interactive,
  onClick,
}: {
  title: string
  value: string
  subtitle?: string
  valueClassName?: string
  interactive?: boolean
  onClick?: () => void
}) {
  return (
    <Card
      size="sm"
      className={interactive ? "cursor-pointer transition-colors hover:bg-muted/40" : undefined}
      onClick={interactive ? onClick : undefined}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                onClick?.()
              }
            }
          : undefined
      }
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`text-xl font-semibold tabular-nums ${valueClassName ?? ""}`}>
          {value}
        </p>
        {subtitle ? (
          <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
        ) : null}
        {interactive ? (
          <p className="mt-1 text-xs text-muted-foreground">Click to view</p>
        ) : null}
      </CardContent>
    </Card>
  )
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <div className="text-muted-foreground">{label}</div>
      <div className="truncate font-medium">{children}</div>
    </div>
  )
}

function projectDurationSoFar(
  startDate: string,
  endDate?: string | null
): string | null {
  const start = startOfDay(parseISO(String(startDate).slice(0, 10)))
  const today = startOfDay(new Date())
  if (isBefore(today, start)) return null
  const end = endDate
    ? startOfDay(parseISO(String(endDate).slice(0, 10)))
    : today
  const until = isBefore(today, end) ? today : end
  return formatDistanceStrict(start, until)
}

function Detail({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{value}</dd>
    </div>
  )
}
