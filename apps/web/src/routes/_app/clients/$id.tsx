import * as React from "react"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { formatDistanceStrict, isBefore, parseISO, startOfDay } from "date-fns"
import { Button, buttonVariants } from "@workspace/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { PageHeader } from "@/components/page-header"
import { HealthBadge, StatusBadge } from "@/components/health-badge"
import { useConfirmDialog } from "@/components/confirm-dialog"
import { ErrorState, LoadingState } from "@/components/ui-states"
import { api, ApiError, type Envelope } from "@/lib/api"
import { formatNpr, paisaToNpr } from "@/lib/money"
import type { Client, OrgSettings, Project } from "@/lib/types"

export const Route = createFileRoute("/_app/clients/$id")({
  component: ClientDetailPage,
})

function ClientDetailPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const { confirm, dialog } = useConfirmDialog()
  const [client, setClient] = React.useState<Client | null>(null)
  const [settings, setSettings] = React.useState<OrgSettings | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

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

  return (
    <div>
      <PageHeader
        title={client.name}
        description="Client detail"
        actions={
          <>
            <StatusBadge status={client.status} />
            <Link
              to="/clients/$id/edit"
              params={{ id }}
              className={buttonVariants()}
            >
              Edit
            </Link>
            {client.status === "active" ? (
              <Button
                variant="outline"
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
                Deactivate
              </Button>
            ) : null}
            <Button
              variant="destructive"
              disabled={!canDelete}
              title={canDelete ? undefined : "Cannot delete: client has projects"}
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
                  void navigate({ to: "/clients" })
                } catch (e) {
                  alert(e instanceof ApiError ? e.message : "Delete failed")
                }
              }}
            >
              Delete
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <section className="min-w-0 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">
              Projects ({projects.length})
            </h2>
          </div>
          {projects.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-sm text-muted-foreground">
                No projects for this client.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {projects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  settings={settings}
                />
              ))}
            </div>
          )}
        </section>

        <aside className="lg:sticky lg:top-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Client details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <DetailRow label="Name" value={client.name} />
              <div className="flex items-center justify-between gap-4 border-b py-2 last:border-0">
                <span className="text-muted-foreground">Status</span>
                <StatusBadge status={client.status} />
              </div>
              <div className="space-y-1 border-b py-2 last:border-0">
                <span className="text-muted-foreground">Contact info</span>
                <p className="whitespace-pre-wrap font-medium">
                  {client.contactInfo?.trim() || "—"}
                </p>
              </div>
              <DetailRow label="Projects" value={String(projects.length)} />
            </CardContent>
          </Card>
        </aside>
      </div>
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
            <StatusBadge status={project.status} />
          </div>
          <p className="text-xs text-muted-foreground line-clamp-1">{categories}</p>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            {profit ? (
              <HealthBadge marginPercent={profit.marginPercent} settings={settings} />
            ) : null}
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

function DetailRow({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="flex justify-between gap-4 border-b py-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  )
}
