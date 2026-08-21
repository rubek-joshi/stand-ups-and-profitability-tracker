import * as React from "react"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import {
  IconAlertTriangle,
  IconCalendarEvent,
  IconCake,
  IconClock,
  IconDotsVertical,
  IconMail,
  IconMessage,
  IconMoon,
  IconPencil,
  IconPhone,
  IconSun,
  IconTrash,
  IconTrendingUp,
  IconUser,
  IconUserOff,
} from "@tabler/icons-react"
import {
  addMonths,
  addYears,
  differenceInCalendarDays,
  differenceInMonths,
  differenceInYears,
  endOfMonth,
  format,
  isAfter,
  isWithinInterval,
  parseISO,
  setYear,
  startOfDay,
  startOfMonth,
  subMonths,
  subYears,
} from "date-fns"
import type { DateRange } from "react-day-picker"
import { Badge } from "@workspace/ui/components/badge"
import { Button, buttonVariants } from "@workspace/ui/components/button"
import { Calendar } from "@workspace/ui/components/calendar"
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
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
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover"
import { Separator } from "@workspace/ui/components/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/health-badge"
import { MailLink, TelLink } from "@/components/contact-link"
import { useConfirmDialog } from "@/components/confirm-dialog"
import { MarkLeftDialog } from "@/components/mark-left-dialog"
import { ErrorState, LoadingState } from "@/components/ui-states"
import {
  TableActionButton,
  TableActionLink,
  TableActionsCell,
  TableActionsHead,
} from "@/components/table-row-actions"
import {
  ProjectAllocationChart,
  ProjectTimelineChart,
  projectColor,
  type InvolvementEntry,
} from "@/components/employee/involvement-chart"
import { api, ApiError, type Envelope } from "@/lib/api"
import { DEFAULT_LIST_SEARCH } from "@/lib/list-query"
import { formatNpr, paisaToNpr, parseNprInput } from "@/lib/money"
import type { Employee, SalaryEntry } from "@/lib/types"

export const Route = createFileRoute("/_app/employees/$id")({
  component: EmployeeDetailPage,
})

type PresetId = "this-month" | "last-month" | "last-3" | "last-6" | "last-12"

type SalaryForm = {
  salaryNpr: string
  effectiveDate: string
  reason: string
}

const emptySalaryForm = (): SalaryForm => ({
  salaryNpr: "",
  effectiveDate: new Date().toISOString().slice(0, 10),
  reason: "",
})

function presetsFor(today: Date): Array<{ id: PresetId; label: string; range: () => DateRange }> {
  return [
    {
      id: "this-month",
      label: "This month",
      range: () => ({ from: startOfMonth(today), to: endOfMonth(today) }),
    },
    {
      id: "last-month",
      label: "Last month",
      range: () => ({
        from: startOfMonth(subMonths(today, 1)),
        to: endOfMonth(subMonths(today, 1)),
      }),
    },
    {
      id: "last-3",
      label: "Last 3 months",
      range: () => ({ from: startOfMonth(subMonths(today, 2)), to: today }),
    },
    {
      id: "last-6",
      label: "Last 6 months",
      range: () => ({ from: startOfMonth(subMonths(today, 5)), to: today }),
    },
    {
      id: "last-12",
      label: "Last 12 months",
      range: () => ({ from: startOfMonth(subYears(today, 1)), to: today }),
    },
  ]
}

function toDateKey(value: string | Date) {
  if (typeof value === "string") return value.slice(0, 10)
  return value.toISOString().slice(0, 10)
}

function nextOccurrence(dateStr: string, today: Date) {
  const base = parseISO(toDateKey(dateStr))
  let next = setYear(base, today.getFullYear())
  if (!isAfter(next, today) && differenceInCalendarDays(next, today) !== 0) {
    next = addYears(next, 1)
  }
  return next
}

function countdownLabel(target: Date, today: Date) {
  const days = differenceInCalendarDays(target, today)
  if (days === 0) return "Today!"
  if (days === 1) return "Tomorrow"
  const months = differenceInMonths(target, today)
  if (months >= 1) {
    const remDays = differenceInCalendarDays(target, addMonths(today, months))
    return remDays > 0 ? `in ${months} mo ${remDays} d` : `in ${months} mo`
  }
  return `in ${days} days`
}

function EmployeeDetailPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const { confirm, dialog } = useConfirmDialog()
  const [markLeftOpen, setMarkLeftOpen] = React.useState(false)
  const [employee, setEmployee] = React.useState<Employee | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [salaryOpen, setSalaryOpen] = React.useState(false)
  const [editingEntry, setEditingEntry] = React.useState<SalaryEntry | null>(null)
  const [salaryForm, setSalaryForm] = React.useState<SalaryForm>(emptySalaryForm)

  const today = React.useMemo(() => startOfDay(new Date()), [])
  const presets = React.useMemo(() => presetsFor(today), [today])
  const [presetId, setPresetId] = React.useState<PresetId>("this-month")
  const [range, setRange] = React.useState<DateRange | undefined>(() =>
    presetsFor(startOfDay(new Date()))[0]!.range(),
  )

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api<Envelope<Employee>>(`/employees/${id}`)
      setEmployee(res.data)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load")
    } finally {
      setLoading(false)
    }
  }, [id])

  React.useEffect(() => {
    void load()
  }, [load])

  const openCreateSalary = () => {
    setEditingEntry(null)
    setSalaryForm(emptySalaryForm())
    setSalaryOpen(true)
  }

  const openEditSalary = (entry: SalaryEntry) => {
    setEditingEntry(entry)
    setSalaryForm({
      salaryNpr: String(paisaToNpr(entry.salaryPaisa)),
      effectiveDate: String(entry.effectiveDate).slice(0, 10),
      reason: entry.reason ?? "",
    })
    setSalaryOpen(true)
  }

  const interval = React.useMemo(() => {
    const from = range?.from ?? startOfMonth(today)
    const to = range?.to ?? from
    return { start: startOfDay(from), end: startOfDay(to) }
  }, [range, today])

  const inRange = React.useCallback(
    (dateStr: string) =>
      isWithinInterval(parseISO(toDateKey(dateStr)), {
        start: interval.start,
        end: interval.end,
      }),
    [interval],
  )

  const involvementEntries = React.useMemo<InvolvementEntry[]>(() => {
    if (!employee?.standupEntries) return []
    const rows: InvolvementEntry[] = []
    for (const entry of employee.standupEntries) {
      const date = toDateKey(entry.standup.date)
      if (!inRange(date)) continue
      for (const allocation of entry.allocations) {
        rows.push({
          date,
          projectId: allocation.projectId,
          projectName: allocation.project?.name ?? allocation.projectId,
          percentage: allocation.percentage,
        })
      }
    }
    return rows
  }, [employee, inRange])

  const attendanceInRange = React.useMemo(
    () => (employee?.attendanceRecords ?? []).filter((r) => inRange(toDateKey(r.date))),
    [employee, inRange],
  )

  const standupsInRange = React.useMemo(
    () =>
      (employee?.standupEntries ?? []).filter(
        (e) =>
          e.attendanceStatus !== "absent" &&
          inRange(toDateKey(e.standup.date)),
      ),
    [employee, inRange],
  )

  const projectMeta = React.useMemo(
    () => [...new Map(involvementEntries.map((e) => [e.projectId, e.projectName])).entries()],
    [involvementEntries],
  )

  const projectIndex = React.useMemo(
    () =>
      new Map(
        [...new Set(involvementEntries.map((e) => e.projectId))].map((pid, i) => [pid, i]),
      ),
    [involvementEntries],
  )

  if (loading) return <LoadingState />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (!employee) return null

  const salaryEntries = employee.salaryEntries ?? []
  const currentSalary = salaryEntries[0]
  const hasLeft = employee.status === "left"
  const joinedKey = toDateKey(employee.dateJoined)
  const tenureYears = differenceInYears(today, parseISO(joinedKey))
  const anniversary = nextOccurrence(joinedKey, today)
  const birthday = employee.dateOfBirth
    ? nextOccurrence(toDateKey(employee.dateOfBirth), today)
    : null

  const spanDays = differenceInCalendarDays(interval.end, interval.start) + 1
  const bucket: "day" | "week" | "month" =
    spanDays <= 45 ? "day" : spanDays <= 200 ? "week" : "month"

  const countType = (type: string) =>
    attendanceInRange.filter((r) => r.type === type).length
  const absents = countType("paid_absence") + countType("unpaid_absence")
  const activeProjects = new Set(involvementEntries.map((e) => e.projectId)).size
  const totalAllocation = involvementEntries.reduce((sum, e) => sum + e.percentage, 0)
  const activeAssignments = (employee.assignments ?? []).filter((a) => !a.unassignedAt)

  const stats = [
    {
      label: "Absents",
      value: absents,
      icon: IconUserOff,
      tone: "text-destructive",
    },
    {
      label: "Late arrivals",
      value: countType("late"),
      icon: IconClock,
      tone: "text-amber-600 dark:text-amber-400",
    },
    {
      label: "First half leave",
      value: countType("first_half_leave"),
      icon: IconSun,
      tone: "text-amber-600 dark:text-amber-400",
    },
    {
      label: "Second half leave",
      value: countType("second_half_leave"),
      icon: IconMoon,
      tone: "text-amber-600 dark:text-amber-400",
    },
    {
      label: "Stand-up records",
      value: standupsInRange.length,
      icon: IconMessage,
      tone: "text-primary",
    },
  ]

  return (
    <div>
      <PageHeader
        title={employee.name}
        description={employee.email}
        breadcrumbs={[
          { label: "Employees", to: "/employees", search: DEFAULT_LIST_SEARCH },
          { label: employee.name },
        ]}
        status={
          <>
            <StatusBadge status={employee.status} />
            {(employee.groups ?? []).map((g) => (
              <Link
                key={g.id}
                to="/employee-groups/$id"
                params={{ id: g.id }}
              >
                <Badge variant="secondary">{g.name}</Badge>
              </Link>
            ))}
          </>
        }
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Employee actions"
                />
              }
            >
              <IconDotsVertical />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-40">
              <DropdownMenuGroup>
                {employee.status === "active" ? (
                  <DropdownMenuItem onClick={() => setMarkLeftOpen(true)}>
                    <IconUserOff />
                    Mark left
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem
                  variant="destructive"
                  onClick={async () => {
                    const ok = await confirm({
                      title: "Delete employee?",
                      description: "Only allowed if there is no history.",
                      confirmLabel: "Delete",
                      destructive: true,
                    })
                    if (!ok) return
                    try {
                      await api(`/employees/${id}`, { method: "DELETE" })
                      void navigate({
                        to: "/employees",
                        search: DEFAULT_LIST_SEARCH,
                      })
                    } catch (e) {
                      alert(e instanceof ApiError ? e.message : "Delete failed")
                    }
                  }}
                >
                  <IconTrash />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      {hasLeft ? (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4">
          <IconAlertTriangle className="size-5 shrink-0 text-destructive" />
          <p className="text-sm">
            <span className="font-semibold">This employee has left the company.</span>
            {employee.dateLeft
              ? ` Last working day ${format(parseISO(toDateKey(employee.dateLeft)), "d MMM yyyy")}.`
              : null}{" "}
            Records are read-only for payroll history.
          </p>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <section className="min-w-0 space-y-6">
          <Card>
            <CardHeader className="gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <CardTitle className="text-base">Project involvement</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {format(interval.start, "d MMM yyyy")} – {format(interval.end, "d MMM yyyy")} ·{" "}
                  {totalAllocation}% allocated across {activeProjects} project
                  {activeProjects === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {presets.map((p) => (
                  <Button
                    key={p.id}
                    size="sm"
                    variant={presetId === p.id ? "default" : "outline"}
                    onClick={() => {
                      setPresetId(p.id)
                      setRange(p.range())
                    }}
                  >
                    {p.label}
                  </Button>
                ))}
                <Popover>
                  <PopoverTrigger
                    className={buttonVariants({
                      size: "sm",
                      variant: "secondary",
                      className: "gap-2",
                    })}
                  >
                    <IconCalendarEvent className="size-4" />
                    Custom
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-auto p-0">
                    <Calendar
                      mode="range"
                      numberOfMonths={2}
                      defaultMonth={interval.start}
                      selected={range}
                      onSelect={(selected: DateRange | undefined) => {
                        setRange(selected)
                        setPresetId("this-month")
                      }}
                      className="p-3"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="by-project">
                <TabsList>
                  <TabsTrigger value="by-project">By project</TabsTrigger>
                  <TabsTrigger value="over-time">Over time</TabsTrigger>
                </TabsList>
                <TabsContent value="by-project" className="mt-4">
                  <ProjectAllocationChart entries={involvementEntries} />
                </TabsContent>
                <TabsContent value="over-time" className="mt-4">
                  <ProjectTimelineChart entries={involvementEntries} bucket={bucket} />
                </TabsContent>
              </Tabs>

              {projectMeta.length > 0 ? (
                <div className="mt-5 flex flex-wrap gap-2">
                  {projectMeta.map(([projectId, name], i) => (
                    <span
                      key={projectId}
                      className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs"
                    >
                      <span
                        className="size-2 rounded-full"
                        style={{ background: projectColor(projectId, i) }}
                      />
                      {name}
                    </span>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {stats.map((s) => (
              <Card key={s.label} size="sm">
                <CardContent>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">{s.label}</p>
                    <s.icon className={`size-4 ${s.tone}`} />
                  </div>
                  <p className="mt-3 text-3xl font-semibold tabular-nums">{s.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    in selected range ({attendanceInRange.length} attendance records)
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base">Salary history</CardTitle>
                {currentSalary ? (
                  <Badge variant="secondary" className="gap-1">
                    <IconTrendingUp className="size-3" />
                    {formatNpr(currentSalary.salaryPaisa)}
                  </Badge>
                ) : null}
              </div>
              <Button size="sm" onClick={openCreateSalary}>
                Add
              </Button>
            </CardHeader>
            <CardContent>
              {salaryEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground">No salary entries</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Effective</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead className="text-right">Change</TableHead>
                      <TableActionsHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salaryEntries.map((entry, i) => {
                      const prev = salaryEntries[i + 1]
                      const current = paisaToNpr(entry.salaryPaisa)
                      const previous = prev ? paisaToNpr(prev.salaryPaisa) : null
                      const delta =
                        previous && previous !== 0
                          ? ((current - previous) / previous) * 100
                          : null
                      return (
                        <TableRow key={entry.id}>
                          <TableCell>
                            <div className="font-medium whitespace-nowrap">
                              {format(parseISO(toDateKey(entry.effectiveDate)), "d MMM yyyy")}
                            </div>
                            {entry.reason?.trim() ? (
                              <div className="text-xs text-muted-foreground">{entry.reason}</div>
                            ) : null}
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {formatNpr(entry.salaryPaisa)}
                          </TableCell>
                          <TableCell className="text-right">
                            {delta === null ? (
                              <span className="text-xs text-muted-foreground">Starting</span>
                            ) : (
                              <Badge variant={delta >= 0 ? "default" : "destructive"}>
                                {delta >= 0 ? "+" : ""}
                                {delta.toFixed(1)}%
                              </Badge>
                            )}
                          </TableCell>
                          <TableActionsCell>
                            <TableActionButton
                              label="Edit"
                              onClick={() => openEditSalary(entry)}
                            >
                              <IconPencil className="size-3.5" />
                            </TableActionButton>
                            <TableActionButton
                              label="Delete"
                              variant="destructive"
                              onClick={async () => {
                                const ok = await confirm({
                                  title: "Delete salary entry?",
                                  description:
                                    "This will recalculate cost and profit/loss for affected periods.",
                                  confirmLabel: "Delete",
                                  destructive: true,
                                })
                                if (!ok) return
                                await api(
                                  `/employees/${id}/salary-entries/${entry.id}`,
                                  { method: "DELETE" },
                                )
                                await load()
                              }}
                            >
                              <IconTrash className="size-3.5" />
                            </TableActionButton>
                          </TableActionsCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Recent stand-ups</CardTitle>
              <Badge variant="outline">{standupsInRange.length} in range</Badge>
            </CardHeader>
            <CardContent>
              {standupsInRange.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No stand-up records in this range.
                </p>
              ) : (
                <ul className="divide-y">
                  {standupsInRange.slice(0, 8).map((entry) => (
                    <li
                      key={entry.id}
                      className="flex flex-wrap items-center gap-3 py-3 text-sm"
                    >
                      <Link
                        to="/stand-ups/$id"
                        params={{ id: entry.standup.id }}
                        className="w-24 shrink-0 font-medium tabular-nums hover:underline"
                      >
                        {format(parseISO(toDateKey(entry.standup.date)), "d MMM")}
                      </Link>
                      <div className="flex flex-wrap gap-2">
                        {entry.allocations.length === 0 ? (
                          <span className="text-xs text-muted-foreground">No projects</span>
                        ) : (
                          entry.allocations.map((a) => (
                            <span
                              key={a.id}
                              className="inline-flex items-center gap-2 text-xs text-muted-foreground"
                            >
                              <span
                                className="size-2 rounded-full"
                                style={{
                                  background: projectColor(
                                    a.projectId,
                                    projectIndex.get(a.projectId) ?? 0,
                                  ),
                                }}
                              />
                              {a.project?.name ?? a.projectId}
                              <span className="tabular-nums">{a.percentage}%</span>
                            </span>
                          ))
                        )}
                      </div>
                      {(() => {
                        const taskPreview = (entry.allocations ?? [])
                          .flatMap((a) => a.tasks ?? [])
                          .map((t) => t.text.trim())
                          .filter(Boolean)
                          .slice(0, 3)
                          .join(" · ")
                        const misc = entry.miscellaneousNotes?.trim()
                        const preview = taskPreview || misc
                        return preview ? (
                          <span className="line-clamp-1 text-muted-foreground">
                            {preview}
                          </span>
                        ) : null
                      })()}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>

        <aside className="lg:sticky lg:top-4 space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">Employee details</CardTitle>
              <TableActionLink
                label="Edit details"
                to="/employees/$id/edit"
                params={{ id }}
              >
                <IconPencil className="size-3.5" />
              </TableActionLink>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <Detail icon={IconUser} label="Name" value={employee.name} />
              <Detail
                icon={IconMail}
                label="Email"
                value={<MailLink value={employee.email} withCopy />}
              />
              <Detail
                icon={IconPhone}
                label="Contact number"
                value={
                  employee.contactNumber ? (
                    <TelLink value={employee.contactNumber} withCopy />
                  ) : (
                    "—"
                  )
                }
              />
              {employee.dateLeft ? (
                <Detail
                  icon={IconUserOff}
                  label="Date left"
                  value={format(parseISO(toDateKey(employee.dateLeft)), "d MMM yyyy")}
                />
              ) : null}

              <Separator />

              <div className="space-y-3">
                <Milestone
                  icon={IconCalendarEvent}
                  label={`${tenureYears + 1}-year work anniversary`}
                  detail={`${tenureYears} yr tenure · joined ${format(parseISO(joinedKey), "d MMM yyyy")}`}
                  date={format(anniversary, "d MMM yyyy")}
                  countdown={countdownLabel(anniversary, today)}
                />
                {birthday ? (
                  <Milestone
                    icon={IconCake}
                    label="Birthday"
                    date={format(birthday, "d MMM yyyy")}
                    countdown={countdownLabel(birthday, today)}
                  />
                ) : null}
              </div>

              {activeAssignments.length > 0 ? (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Active projects
                    </p>
                    <ul className="mt-2 space-y-1">
                      {activeAssignments.map((a) => (
                        <li key={a.id}>
                          <Link
                            to="/projects/$id"
                            params={{ id: a.project.id }}
                            className="font-medium hover:underline"
                          >
                            {a.project.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>
        </aside>
      </div>
      {dialog}
      <Dialog
        open={salaryOpen}
        onOpenChange={(open) => {
          setSalaryOpen(open)
          if (!open) setEditingEntry(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingEntry ? "Edit salary entry" : "Add salary entry"}
            </DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault()
              const body = {
                salaryNpr: parseNprInput(salaryForm.salaryNpr),
                effectiveDate: salaryForm.effectiveDate,
                reason: salaryForm.reason.trim() || undefined,
              }
              if (editingEntry) {
                const ok = await confirm({
                  title: "Update salary entry?",
                  description:
                    "This may recalculate cost and profit/loss for affected projects.",
                  confirmLabel: "Update",
                  destructive: true,
                })
                if (!ok) return
                await api(`/employees/${id}/salary-entries/${editingEntry.id}`, {
                  method: "PATCH",
                  body,
                })
              } else {
                await api(`/employees/${id}/salary-entries`, {
                  method: "POST",
                  body,
                })
              }
              setSalaryOpen(false)
              setEditingEntry(null)
              await load()
            }}
          >
            <div className="space-y-2">
              <Label>Salary (NPR)</Label>
              <Input
                required
                value={salaryForm.salaryNpr}
                onChange={(e) =>
                  setSalaryForm((f) => ({ ...f, salaryNpr: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Effective date</Label>
              <Input
                type="date"
                required
                value={salaryForm.effectiveDate}
                onChange={(e) =>
                  setSalaryForm((f) => ({ ...f, effectiveDate: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Input
                value={salaryForm.reason}
                onChange={(e) =>
                  setSalaryForm((f) => ({ ...f, reason: e.target.value }))
                }
                placeholder="Optional"
              />
            </div>
            <DialogFooter>
              <Button type="submit">
                {editingEntry ? "Save entry" : "Add entry"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <MarkLeftDialog
        open={markLeftOpen}
        onOpenChange={setMarkLeftOpen}
        personName={employee?.name}
        onConfirm={async (dateLeft) => {
          try {
            await api(`/employees/${id}/mark-left`, {
              method: "POST",
              body: { dateLeft },
            })
            await load()
          } catch (e) {
            alert(e instanceof ApiError ? e.message : "Failed to mark left")
            throw e
          }
        }}
      />
    </div>
  )
}

function Detail({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
        <dd className="text-sm font-medium">{value}</dd>
      </div>
    </div>
  )
}

function Milestone({
  icon: Icon,
  label,
  detail,
  date,
  countdown,
}: {
  icon: React.ElementType
  label: string
  detail?: string
  date: string
  countdown: string
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Icon className="size-4 text-primary" />
        {label}
      </div>
      {detail ? (
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      ) : null}
      <p className={`text-sm text-muted-foreground ${detail ? "mt-1" : "mt-2"}`}>
        {date}
      </p>
      <p className="text-sm font-semibold text-primary">{countdown}</p>
    </div>
  )
}
