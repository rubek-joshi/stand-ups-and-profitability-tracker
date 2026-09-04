import * as React from "react"
import { createFileRoute } from "@tanstack/react-router"
import {
  IconAlertTriangle,
  IconCalendarClock,
  IconLayoutGrid,
  IconShieldCheck,
  IconTable,
  IconWallet,
  IconX,
} from "@tabler/icons-react"
import { format, parseISO } from "date-fns"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import { AmcCard } from "@/components/amc/amc-card"
import { AmcTable } from "@/components/amc/amc-table"
import { CreateAmcDialog } from "@/components/amc/create-amc-dialog"
import { DeclineAmcDialog } from "@/components/amc/decline-amc-dialog"
import { EditAmcDialog } from "@/components/amc/edit-amc-dialog"
import { useConfirmDialog } from "@/components/confirm-dialog"
import { DateInput } from "@/components/datetime-picker"
import { PageHeader } from "@/components/page-header"
import { PaginationBar } from "@/components/pagination-bar"
import { ErrorState, LoadingState, EmptyState } from "@/components/ui-states"
import { api, ApiError } from "@/lib/api"
import type { PaginatedEnvelope } from "@/lib/api"
import { amcDisplayStatus } from "@/lib/amc"
import { useAuth } from "@/lib/auth"
import {
  buildListQuery,
  clampPage,
  parseListSearch,
  parseOptionalString,
  totalPagesFor,
} from "@/lib/list-query"
import { formatNpr } from "@/lib/money"
import type { AmcRecord, Client } from "@/lib/types"
import { getStoredView, parseListView, setStoredView } from "@/lib/view-pref"

const AMC_TABS = ["ongoing", "upcoming", "attention", "all"] as const
type AmcTab = (typeof AMC_TABS)[number]
const AMC_VIEW_KEY = "pt_amc_view"

function parseAmcTab(value: unknown): AmcTab {
  return AMC_TABS.includes(value as AmcTab) ? (value as AmcTab) : "ongoing"
}

const EMPTY_COPY: Record<AmcTab, string> = {
  ongoing: "No AMCs are currently running.",
  upcoming: "Nothing scheduled yet — create an AMC to plan ahead.",
  attention: "All clear. No renewals pending.",
  all: "No AMCs yet.",
}

export const Route = createFileRoute("/_app/amc/")({
  validateSearch: (search: Record<string, unknown>) => {
    const { page, pageSize } = parseListSearch(search)
    const clientId = parseOptionalString(search.clientId)
    const from = parseOptionalString(search.from)
    const to = parseOptionalString(search.to)
    const tab = search.tab === undefined ? undefined : parseAmcTab(search.tab)
    const view = parseListView(search.view)
    return {
      page,
      pageSize,
      ...(clientId ? { clientId } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(tab ? { tab } : {}),
      ...(view && view !== "card" ? { view } : {}),
    }
  },
  component: AmcPage,
})

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof IconShieldCheck
  label: string
  value: number | string
  hint: string
}) {
  return (
    <Card size="sm">
      <CardContent>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="size-4" />
          <span className="text-xs font-medium tracking-wide uppercase">
            {label}
          </span>
        </div>
        <p className="mt-3 text-3xl font-semibold tabular-nums">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  )
}

function formatFilterDate(value: string) {
  try {
    return format(parseISO(value.slice(0, 10)), "d MMM yyyy")
  } catch {
    return value
  }
}

function FilterChip({
  label,
  onRemove,
}: {
  label: string
  onRemove: () => void
}) {
  return (
    <Badge variant="secondary" className="h-7 gap-1 pr-1">
      <span>{label}</span>
      <button
        type="button"
        className="rounded-full p-0.5 hover:bg-muted"
        aria-label={`Remove ${label} filter`}
        onClick={onRemove}
      >
        <IconX className="size-3" />
      </button>
    </Badge>
  )
}

function AmcPage() {
  const navigate = Route.useNavigate()
  const {
    clientId,
    from,
    to,
    tab = "ongoing",
    view = "card",
    page,
    pageSize,
  } = Route.useSearch()
  const { user } = useAuth()

  React.useLayoutEffect(() => {
    if (view === "table") {
      setStoredView(AMC_VIEW_KEY, "table")
      return
    }
    if (getStoredView(AMC_VIEW_KEY) !== "table") return
    void navigate({
      search: (prev) => ({ ...prev, view: "table" }),
      replace: true,
    })
  }, [])

  const setView = (next: "card" | "table") => {
    setStoredView(AMC_VIEW_KEY, next)
    void navigate({
      search: (prev) => ({
        ...prev,
        view: next === "card" ? undefined : next,
      }),
    })
  }
  const { confirm, dialog } = useConfirmDialog()
  const canDelete = user?.role === "super_admin"

  const [amcs, setAmcs] = React.useState<AmcRecord[]>([])
  const [clients, setClients] = React.useState<Client[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [presetProjectId, setPresetProjectId] = React.useState<
    string | undefined
  >()
  const [declineAmc, setDeclineAmc] = React.useState<AmcRecord | null>(null)
  const [editAmc, setEditAmc] = React.useState<AmcRecord | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = buildListQuery({
        clientId,
        from,
        to,
      })
      const res = await api<PaginatedEnvelope<AmcRecord[]>>(
        qs ? `/amc?${qs}` : "/amc"
      )
      setAmcs(res.data)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load AMCs")
    } finally {
      setLoading(false)
    }
  }, [clientId, from, to])

  React.useEffect(() => {
    void load()
  }, [load])

  React.useEffect(() => {
    const request = { cancelled: false }
    void (async () => {
      try {
        const res = await api<PaginatedEnvelope<Client[]>>("/clients")
        if (!request.cancelled) setClients(res.data)
      } catch {
        // Client filter stays empty if load fails
      }
    })()
    return () => {
      request.cancelled = true
    }
  }, [])

  const clientItems = React.useMemo(
    () => Object.fromEntries(clients.map((c) => [c.id, c.name])),
    [clients]
  )

  const hasFilters = Boolean(clientId || from || to)
  const selectedClientName = clientId
    ? clients.find((c) => c.id === clientId)?.name
    : undefined

  const groups = React.useMemo(() => {
    const withStatus = amcs.map((a) => ({
      amc: a,
      status: amcDisplayStatus(a),
    }))
    return {
      ongoing: withStatus.filter(
        (x) => x.status === "ongoing" || x.status === "expiring"
      ),
      upcoming: withStatus.filter((x) => x.status === "upcoming"),
      attention: withStatus.filter(
        (x) => x.status === "awaiting-decision" || x.status === "expiring"
      ),
      expired: withStatus.filter((x) => x.status === "expired"),
      all: withStatus,
    }
  }, [amcs])

  const paidValuePaisa = amcs
    .filter((a) => a.type === "paid" && amcDisplayStatus(a) !== "expired")
    .reduce((sum, a) => sum + BigInt(a.amcAmountPaisa ?? "0"), 0n)

  const handleRenew = async (amc: AmcRecord) => {
    try {
      await api(`/amc/${amc.id}/renewal-decision`, {
        method: "POST",
        body: { decision: "renewed" },
      })
      setPresetProjectId(amc.projectId)
      setCreateOpen(true)
      await load()
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "Failed to mark renewal")
    }
  }

  const handleDecline = (amc: AmcRecord) => {
    setDeclineAmc(amc)
  }

  const submitDecline = async (remark?: string) => {
    if (!declineAmc) return
    try {
      await api(`/amc/${declineAmc.id}/renewal-decision`, {
        method: "POST",
        body: {
          decision: "declined",
          ...(remark ? { remark } : {}),
        },
      })
      setDeclineAmc(null)
      await load()
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "Failed to decline renewal")
      throw e
    }
  }

  const handleDelete = async (amc: AmcRecord) => {
    const ok = await confirm({
      title: "Delete AMC permanently?",
      description:
        "This cannot be undone. Prefer decline/cancel when the contract simply ended.",
      confirmLabel: "Delete",
      destructive: true,
    })
    if (!ok) return
    try {
      await api(`/amc/${amc.id}`, { method: "DELETE" })
      await load()
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "Failed to delete AMC")
    }
  }

  const tabItems = groups[tab]
  const total = tabItems.length
  const totalPages = totalPagesFor(total, pageSize)
  const safePage = clampPage(page, totalPages)
  const pagedItems = tabItems.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize
  )
  const cardActions = {
    onRenew: (a: AmcRecord) => void handleRenew(a),
    onDecline: (a: AmcRecord) => void handleDecline(a),
    onEdit: setEditAmc,
    onDelete: (a: AmcRecord) => void handleDelete(a),
    canDelete,
  }

  return (
    <div>
      <PageHeader
        title="AMC"
        description="Complimentary periods, renewal follow-ups, and paid maintenance contracts."
        actions={
          <Button
            onClick={() => {
              setPresetProjectId(undefined)
              setCreateOpen(true)
            }}
          >
            New AMC
          </Button>
        }
      />

      <div className="mb-6 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Client
            </span>
            <Select
              value={clientId || null}
              onValueChange={(v) => {
                void navigate({
                  search: (prev) => ({
                    ...prev,
                    clientId: v || undefined,
                    page: 1,
                  }),
                })
              }}
              items={clientItems}
            >
              <SelectTrigger className="w-52">
                <SelectValue placeholder="All clients" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              From
            </span>
            <DateInput
              className="w-40"
              clearable
              value={from}
              onChange={(next) => {
                void navigate({
                  search: (prev) => ({ ...prev, from: next, page: 1 }),
                })
              }}
            />
          </div>
          <div className="grid gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              To
            </span>
            <DateInput
              className="w-40"
              clearable
              value={to}
              onChange={(next) => {
                void navigate({
                  search: (prev) => ({ ...prev, to: next, page: 1 }),
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
                    clientId: undefined,
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

        {hasFilters ? (
          <div className="flex flex-wrap items-center gap-2">
            {clientId ? (
              <FilterChip
                label={`Client: ${selectedClientName ?? "Unknown"}`}
                onRemove={() => {
                  void navigate({
                    search: (prev) => ({
                      ...prev,
                      clientId: undefined,
                      page: 1,
                    }),
                  })
                }}
              />
            ) : null}
            {from ? (
              <FilterChip
                label={`From: ${formatFilterDate(from)}`}
                onRemove={() => {
                  void navigate({
                    search: (prev) => ({ ...prev, from: undefined, page: 1 }),
                  })
                }}
              />
            ) : null}
            {to ? (
              <FilterChip
                label={`To: ${formatFilterDate(to)}`}
                onRemove={() => {
                  void navigate({
                    search: (prev) => ({ ...prev, to: undefined, page: 1 }),
                  })
                }}
              />
            ) : null}
          </div>
        ) : null}
      </div>

      {loading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && !error ? (
        <>
          <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={IconShieldCheck}
              label="Active AMCs"
              value={groups.ongoing.length}
              hint="Currently under maintenance"
            />
            <StatCard
              icon={IconCalendarClock}
              label="Upcoming"
              value={groups.upcoming.length}
              hint="Scheduled to start"
            />
            <StatCard
              icon={IconAlertTriangle}
              label="Needs follow-up"
              value={groups.attention.length}
              hint="Expiring or awaiting client decision"
            />
            <StatCard
              icon={IconWallet}
              label="Paid AMC value"
              value={formatNpr(String(paidValuePaisa))}
              hint="Across live paid contracts"
            />
          </section>

          {amcs.length === 0 ? (
            <EmptyState
              message={
                hasFilters
                  ? "No AMCs match these filters."
                  : "No AMCs yet — create one for a closed project."
              }
            />
          ) : (
            <div className="space-y-6">
              <Tabs
                value={tab}
                onValueChange={(next) => {
                  void navigate({
                    search: (prev) => ({
                      ...prev,
                      tab: parseAmcTab(next),
                      page: 1,
                    }),
                  })
                }}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <TabsList>
                    <TabsTrigger value="all">
                      All ({groups.all.length})
                    </TabsTrigger>
                    <TabsTrigger value="ongoing">
                      Ongoing ({groups.ongoing.length})
                    </TabsTrigger>
                    <TabsTrigger value="upcoming">
                      Upcoming ({groups.upcoming.length})
                    </TabsTrigger>
                    <TabsTrigger value="attention">
                      Follow-up ({groups.attention.length})
                    </TabsTrigger>
                  </TabsList>
                  <div className="flex items-center gap-1 rounded-md border p-0.5">
                    <Button
                      type="button"
                      size="sm"
                      variant={view === "card" ? "secondary" : "ghost"}
                      className="h-8 gap-1.5 px-2.5"
                      aria-pressed={view === "card"}
                      onClick={() => setView("card")}
                    >
                      <IconLayoutGrid className="size-3.5" />
                      Cards
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={view === "table" ? "secondary" : "ghost"}
                      className="h-8 gap-1.5 px-2.5"
                      aria-pressed={view === "table"}
                      onClick={() => setView("table")}
                    >
                      <IconTable className="size-3.5" />
                      Table
                    </Button>
                  </div>
                </div>
              </Tabs>

              {pagedItems.length === 0 ? (
                <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
                  {EMPTY_COPY[tab]}
                </div>
              ) : view === "table" ? (
                <AmcTable
                  items={pagedItems.map(({ amc }) => amc)}
                  {...cardActions}
                />
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {pagedItems.map(({ amc }) => (
                    <AmcCard key={amc.id} amc={amc} {...cardActions} />
                  ))}
                </div>
              )}

              {total > 0 ? (
                <PaginationBar
                  page={safePage}
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
          )}
        </>
      ) : null}

      <CreateAmcDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        presetProjectId={presetProjectId}
        onCreated={() => void load()}
      />
      <EditAmcDialog
        amc={editAmc}
        open={Boolean(editAmc)}
        onOpenChange={(open) => {
          if (!open) setEditAmc(null)
        }}
        onUpdated={() => void load()}
      />
      <DeclineAmcDialog
        amc={declineAmc}
        open={Boolean(declineAmc)}
        onOpenChange={(open) => {
          if (!open) setDeclineAmc(null)
        }}
        onConfirm={submitDecline}
      />
      {dialog}
    </div>
  )
}
