import * as React from "react"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import {
  IconChevronDown,
  IconDotsVertical,
  IconPencil,
  IconTrash,
  IconUserOff,
} from "@tabler/icons-react"
import { formatDistanceStrict, isBefore, parseISO, startOfDay } from "date-fns"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { PageHeader } from "@/components/page-header"
import { HealthBadge, StatusBadge } from "@/components/health-badge"
import { MailLink, TelLink } from "@/components/contact-link"
import { CreateProjectDialog } from "@/components/create-project-dialog"
import { useConfirmDialog } from "@/components/confirm-dialog"
import { TableActionLink } from "@/components/table-row-actions"
import { ErrorState, LoadingState } from "@/components/ui-states"
import { api, ApiError, type Envelope } from "@/lib/api"
import { DEFAULT_LIST_SEARCH } from "@/lib/list-query"
import { formatNpr, paisaToNpr } from "@/lib/money"
import type { Client, OrgSettings, Project } from "@/lib/types"

export const Route = createFileRoute("/_app/clients/$id")({
  component: ClientDetailPage,
})

function isClosedProject(project: Project) {
  return project.status === "closed"
}

type InvolvedPerson = { id: string; name: string }

function ClientDetailPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const { confirm, dialog } = useConfirmDialog()
  const [client, setClient] = React.useState<Client | null>(null)
  const [settings, setSettings] = React.useState<OrgSettings | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [peopleModal, setPeopleModal] = React.useState<{
    title: string
    people: InvolvedPerson[]
    emptyLabel: string
    href: "/employees/$id" | "/core-members/$id"
  } | null>(null)

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

  if (loading) return <LoadingState />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (!client) return null

  const canDelete = (client._count?.projects ?? client.projects?.length ?? 0) === 0
  const projects = client.projects ?? []
  const openProjects = projects.filter((p) => !isClosedProject(p))
  const closedProjects = projects.filter(isClosedProject)
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

          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-muted-foreground">Projects</h2>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              Add project
            </Button>
          </div>
          {projects.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-sm text-muted-foreground">
                No projects for this client.
              </CardContent>
            </Card>
          ) : (
            <>
              <ProjectSection
                title="Open projects"
                count={openProjects.length}
                defaultOpen
                projects={openProjects}
                settings={settings}
                emptyLabel="No open projects."
              />
              <ProjectSection
                title="Closed projects"
                count={closedProjects.length}
                defaultOpen={false}
                projects={closedProjects}
                settings={settings}
                emptyLabel="No closed projects."
              />
            </>
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

function ProjectSection({
  title,
  count,
  defaultOpen,
  projects,
  settings,
  emptyLabel,
}: {
  title: string
  count: number
  defaultOpen: boolean
  projects: Project[]
  settings: OrgSettings | null
  emptyLabel: string
}) {
  const [open, setOpen] = React.useState(defaultOpen)

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="space-y-3">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2 text-left text-sm font-medium hover:bg-muted/40">
        <span>
          {title}{" "}
          <span className="text-muted-foreground">({count})</span>
        </span>
        <IconChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        {projects.length === 0 ? (
          <p className="px-1 py-2 text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          <div className="grid gap-4 xl:grid-cols-1 2xl:grid-cols-2 3xl:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} settings={settings} />
            ))}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
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
              {String(project.endDate).slice(0, 10)}
            </Meta>
            {duration ? <Meta label="Duration so far">{duration}</Meta> : null}
            <Meta label="Extensions">{String(project.extensionCount ?? 0)}</Meta>
            <Meta label="Budget">{formatNpr(project.budgetPaisa)}</Meta>
          </div>

          {profit ? (
            <div className="flex items-baseline justify-between gap-2 border-t pt-3">
              <span className="text-xs text-muted-foreground">Profit / Loss</span>
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
          ) : null}
        </CardContent>
      </Card>
    </Link>
  )
}

function StatCard({
  title,
  value,
  valueClassName,
  interactive,
  onClick,
}: {
  title: string
  value: string
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

function projectDurationSoFar(startDate: string, endDate: string): string | null {
  const start = startOfDay(parseISO(String(startDate).slice(0, 10)))
  const end = startOfDay(parseISO(String(endDate).slice(0, 10)))
  const today = startOfDay(new Date())
  if (isBefore(today, start)) return null
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
