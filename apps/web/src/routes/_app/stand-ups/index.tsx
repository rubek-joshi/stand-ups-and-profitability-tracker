import * as React from "react"
import { Link, createFileRoute } from "@tanstack/react-router"
import { IconEye } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
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
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import { PageHeader } from "@/components/page-header"
import { PaginationBar } from "@/components/pagination-bar"
import { StandupCalendar, utcIsoDate } from "@/components/standup/standup-calendar"
import { StandupHistoryView } from "@/components/standup/standup-history-view"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui-states"
import {
  NavigableTableRow,
  TableActionLink,
  TableActionsCell,
  TableActionsHead,
} from "@/components/table-row-actions"
import {
  DEFAULT_PRESET_DAYS,
  rangeFromDays,
} from "@/components/dashboard/date-range-bar"
import { api, ApiError, type Envelope, type PaginatedEnvelope } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { toIsoDateInput } from "@/lib/dashboard-metrics"
import { buildListQuery, parsePage, parsePageSize, totalPagesFor } from "@/lib/list-query"
import type { EmployeeGroup, Standup } from "@/lib/types"
import { format, parseISO } from "date-fns"

function defaultHistoryRange() {
  const range = rangeFromDays(DEFAULT_PRESET_DAYS)
  return {
    from: toIsoDateInput(range.from),
    to: toIsoDateInput(range.to),
  }
}

function parseIsoSearchDate(value: unknown): string {
  if (typeof value !== "string") return ""
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ""
}

function parseEmployeeIdsSearch(search: Record<string, unknown>): string[] {
  const fromList =
    typeof search.employeeIds === "string"
      ? search.employeeIds
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      : Array.isArray(search.employeeIds)
        ? search.employeeIds.filter(
            (value): value is string =>
              typeof value === "string" && value.trim().length > 0,
          )
        : []
  const single =
    typeof search.employeeId === "string" && search.employeeId.trim()
      ? search.employeeId.trim()
      : null
  const ids = [...fromList]
  if (single && !ids.includes(single)) ids.push(single)
  return [...new Set(ids)]
}

export const Route = createFileRoute("/_app/stand-ups/")({
  validateSearch: (search: Record<string, unknown>) => {
    const defaults = defaultHistoryRange()
    const from = parseIsoSearchDate(search.from)
    const to = parseIsoSearchDate(search.to)
    return {
      page: parsePage(search.page),
      pageSize: parsePageSize(search.pageSize),
      view:
        search.view === "calendar"
          ? ("calendar" as const)
          : search.view === "history"
            ? ("history" as const)
            : ("list" as const),
      q: typeof search.q === "string" ? search.q : "",
      employeeIds: parseEmployeeIdsSearch(search).join(","),
      projectId:
        typeof search.projectId === "string" ? search.projectId : "",
      from: from && to ? from : defaults.from,
      to: from && to ? to : defaults.to,
    }
  },
  component: StandupsPage,
})

function formatStandupDate(value: string) {
  const key = String(value).slice(0, 10)
  try {
    return format(parseISO(key), "EEE, d MMM yyyy")
  } catch {
    return key
  }
}

function StandupsPage() {
  const navigate = Route.useNavigate()
  const { page, pageSize, view, q, employeeIds, projectId, from, to } =
    Route.useSearch()
  const employeeIdList = React.useMemo(
    () =>
      employeeIds
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    [employeeIds],
  )
  const { user, refreshUser } = useAuth()
  const [items, setItems] = React.useState<Standup[]>([])
  const [total, setTotal] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState(false)
  const [date, setDate] = React.useState(() => utcIsoDate())
  const [groups, setGroups] = React.useState<EmployeeGroup[]>([])
  const [scope, setScope] = React.useState<"everyone" | "group">("everyone")
  const [groupId, setGroupId] = React.useState("")
  const [remember, setRemember] = React.useState(false)
  const [creating, setCreating] = React.useState(false)

  const preference = user?.standupScopePreference ?? "ask"
  const askEveryTime = preference === "ask"

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = buildListQuery({ page, pageSize })
      const res = await api<PaginatedEnvelope<Standup[]>>(`/standups?${qs}`)
      setItems(res.data)
      setTotal(res.meta?.total ?? res.data.length)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load stand-ups")
    } finally {
      setLoading(false)
    }
  }, [page, pageSize])

  React.useEffect(() => {
    if (view === "list") void load()
  }, [load, view])

  const openCreate = async (initialDate?: string) => {
    setDate(initialDate ?? utcIsoDate())
    setRemember(false)
    if (preference === "group" && user?.standupPreferredGroupId) {
      setScope("group")
      setGroupId(user.standupPreferredGroupId)
    } else if (preference === "everyone") {
      setScope("everyone")
      setGroupId("")
    } else {
      setScope("everyone")
      setGroupId("")
    }
    try {
      const res = await api<PaginatedEnvelope<EmployeeGroup[]> | Envelope<EmployeeGroup[]>>(
        "/employee-groups",
      )
      setGroups(res.data)
    } catch {
      setGroups([])
    }
    setOpen(true)
  }

  const maxDate = utcIsoDate()
  const totalPages = totalPagesFor(total, pageSize)
  const groupItems = Object.fromEntries(groups.map((g) => [g.id, g.name]))

  const afterCreate = async (standupId: string) => {
    setOpen(false)
    await navigate({
      to: "/stand-ups/$id",
      params: { id: standupId },
    })
  }

  return (
    <div>
      <PageHeader
        title="Stand-ups"
        description="Daily allocations and attendance"
        actions={<Button onClick={() => void openCreate()}>New stand-up</Button>}
      />

      <Tabs
        value={view}
        onValueChange={(next) => {
          void navigate({
            search: (prev) => ({
              ...prev,
              view: next as "list" | "calendar" | "history",
            }),
          })
        }}
        className="mb-6"
      >
        <TabsList>
          <TabsTrigger value="list">List</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-4">
          {loading ? <LoadingState /> : null}
          {error ? <ErrorState message={error} onRetry={load} /> : null}
          {!loading && items.length === 0 ? (
            <EmptyState message="No stand-ups yet" />
          ) : null}
          {items.length > 0 ? (
            <div className="space-y-4">
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Working</TableHead>
                      <TableHead>Absent</TableHead>
                      <TableHead>Projects</TableHead>
                      <TableHead>Last updated by</TableHead>
                      <TableActionsHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((s) => (
                      <NavigableTableRow
                        key={s.id}
                        to="/stand-ups/$id"
                        params={{ id: s.id }}
                      >
                        <TableCell>
                          <Link
                            to="/stand-ups/$id"
                            params={{ id: s.id }}
                            className="font-medium hover:underline"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {formatStandupDate(String(s.date))}
                          </Link>
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {s.stats?.working ?? "—"}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {s.stats?.absent ?? "—"}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {s.stats?.projectCount ?? "—"}
                        </TableCell>
                        <TableCell>
                          {s.updatedBy?.name ?? s.createdBy?.name ?? "—"}
                        </TableCell>
                        <TableActionsCell>
                          <TableActionLink
                            label="Open"
                            to="/stand-ups/$id"
                            params={{ id: s.id }}
                          >
                            <IconEye className="size-3.5" />
                          </TableActionLink>
                        </TableActionsCell>
                      </NavigableTableRow>
                    ))}
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
        </TabsContent>

        <TabsContent value="calendar" className="mt-4">
          <StandupCalendar onMissingDayClick={(day) => void openCreate(day)} />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <StandupHistoryView
            q={q}
            employeeIds={employeeIdList}
            projectId={projectId}
            from={from}
            to={to}
            onSearchChange={(value) => {
              void navigate({
                search: (prev) => ({
                  ...prev,
                  q: value,
                }),
              })
            }}
            onEmployeeIdsChange={(ids) => {
              void navigate({
                search: (prev) => ({
                  ...prev,
                  employeeIds: ids.join(","),
                }),
              })
            }}
            onProjectChange={(value) => {
              void navigate({
                search: (prev) => ({
                  ...prev,
                  projectId: value,
                }),
              })
            }}
            onRangeChange={(nextFrom, nextTo) => {
              void navigate({
                search: (prev) => ({
                  ...prev,
                  from: nextFrom,
                  to: nextTo,
                }),
              })
            }}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create stand-up</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault()
              if (date > utcIsoDate()) {
                alert("Stand-ups cannot be created for a future date.")
                return
              }
              const effectiveScope =
                askEveryTime
                  ? scope
                  : preference === "group"
                    ? "group"
                    : "everyone"
              const effectiveGroupId =
                effectiveScope === "group"
                  ? askEveryTime
                    ? groupId
                    : user?.standupPreferredGroupId ?? groupId
                  : undefined
              if (effectiveScope === "group" && !effectiveGroupId) {
                alert("Pick a group for this stand-up.")
                return
              }
              setCreating(true)
              try {
                if (askEveryTime && remember) {
                  await api("/auth/me", {
                    method: "PATCH",
                    body: {
                      standupScopePreference:
                        effectiveScope === "group" ? "group" : "everyone",
                      standupPreferredGroupId:
                        effectiveScope === "group" ? effectiveGroupId : null,
                    },
                  })
                  await refreshUser()
                }
                const res = await api<Envelope<Standup>>("/standups", {
                  method: "POST",
                  body: { date },
                })
                await afterCreate(res.data.id)
              } catch (err) {
                alert(err instanceof ApiError ? err.message : "Failed")
              } finally {
                setCreating(false)
              }
            }}
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="standup-date">Date</Label>
                {date === maxDate ? (
                  <span className="text-xs text-muted-foreground">Today</span>
                ) : null}
              </div>
              <Input
                id="standup-date"
                type="date"
                required
                max={maxDate}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Today or a past date. One stand-up per day.
              </p>
            </div>

            {askEveryTime ? (
              <>
                <div className="space-y-2">
                  <Label>Who do you want to focus on?</Label>
                  <p className="text-xs text-muted-foreground">
                    All active employees are included in the stand-up. This only
                    sets your default view filter.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        ["everyone", "Everyone"],
                        ["group", "A specific group"],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setScope(value)}
                        className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                          scope === value
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-card text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {scope === "group" ? (
                  <div className="space-y-2">
                    <Label>Group</Label>
                    <Select
                      value={groupId || null}
                      onValueChange={(v) => setGroupId(v ?? "")}
                      items={groupItems}
                      disabled={groups.length === 0}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue
                          placeholder={
                            groups.length === 0
                              ? "No groups yet"
                              : "Choose a group"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {groups.map((g) => (
                          <SelectItem key={g.id} value={g.id}>
                            {g.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={remember}
                    onCheckedChange={(v) => setRemember(Boolean(v))}
                  />
                  Remember my choice
                </label>
                <p className="text-xs text-muted-foreground">
                  Change this later from your{" "}
                  <Link to="/profile" className="underline">
                    profile
                  </Link>
                  .
                </p>
              </>
            ) : (
              <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
                Using saved view filter:{" "}
                {preference === "group"
                  ? `group “${user?.standupPreferredGroup?.name ?? "selected"}”`
                  : "everyone"}
                . All employees are still included in the stand-up.{" "}
                <Link to="/profile" className="underline">
                  Change in profile
                </Link>
              </p>
            )}

            <DialogFooter>
              <Button type="submit" disabled={creating}>
                {creating ? "Creating…" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
