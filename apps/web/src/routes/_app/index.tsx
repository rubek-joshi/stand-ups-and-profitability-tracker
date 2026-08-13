import * as React from "react"
import { Link, createFileRoute } from "@tanstack/react-router"
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { PageHeader } from "@/components/page-header"
import { ErrorState, LoadingState } from "@/components/ui-states"
import { HealthBadge, StatusBadge } from "@/components/health-badge"
import { api, ApiError, type Envelope } from "@/lib/api"
import { formatNpr } from "@/lib/money"
import type { DashboardSummary, OrgSettings } from "@/lib/types"

export const Route = createFileRoute("/_app/")({
  component: DashboardPage,
})

function DashboardPage() {
  const [from, setFrom] = React.useState("")
  const [to, setTo] = React.useState("")
  const [data, setData] = React.useState<DashboardSummary | null>(null)
  const [settings, setSettings] = React.useState<OrgSettings | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (from) params.set("from", from)
      if (to) params.set("to", to)
      const qs = params.toString()
      const [dash, sett] = await Promise.all([
        api<Envelope<DashboardSummary>>(`/dashboard/summary${qs ? `?${qs}` : ""}`),
        api<Envelope<OrgSettings>>("/settings").catch(() => null),
      ])
      setData(dash.data)
      setSettings(sett?.data ?? null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load dashboard")
    } finally {
      setLoading(false)
    }
  }, [from, to])

  React.useEffect(() => {
    void load()
  }, [load])

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Org-wide profitability overview"
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="from" className="text-xs">
                From
              </Label>
              <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="to" className="text-xs">
                To
              </Label>
              <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setFrom("")
                setTo("")
              }}
            >
              Clear
            </Button>
          </div>
        }
      />

      {loading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}

      {data && !loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard title="Total Profit" value={formatNpr(data.totalProfitPaisa)} />
            <StatCard title="Total Loss" value={formatNpr(data.totalLossPaisa)} />
            <StatCard title="Overall Margin" value={`${data.overallMarginPercent.toFixed(1)}%`} />
            <StatCard
              title="Projects"
              value={`${data.activeCount} active / ${data.closedCount} closed`}
            />
            <StatCard
              title="Unpaid VAT"
              value={formatNpr(data.accumulatedVat?.unpaidPaisa ?? "0")}
            />
            <StatCard
              title="AMC reminders"
              value={String(data.amcReminders?.length ?? 0)}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ListCard title="Top profitable">
              {(data.top5Profitable ?? []).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <Link to="/projects/$id" params={{ id: p.id }} className="truncate hover:underline">
                    {p.name}
                  </Link>
                  <div className="flex items-center gap-2">
                    <HealthBadge marginPercent={p.marginPercent} settings={settings} />
                    <span className="tabular-nums">{formatNpr(p.profitLossPaisa, { signed: true })}</span>
                  </div>
                </li>
              ))}
            </ListCard>
            <ListCard title="Top loss-making">
              {(data.top5LossMaking ?? []).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <Link to="/projects/$id" params={{ id: p.id }} className="truncate hover:underline">
                    {p.name}
                  </Link>
                  <div className="flex items-center gap-2">
                    <HealthBadge marginPercent={p.marginPercent} settings={settings} />
                    <span className="tabular-nums">{formatNpr(p.profitLossPaisa, { signed: true })}</span>
                  </div>
                </li>
              ))}
            </ListCard>
            <ListCard title="Trending over budget">
              {(data.trendingOverBudget ?? []).length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">None</p>
              ) : (
                (data.trendingOverBudget ?? []).map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <Link to="/projects/$id" params={{ id: p.id }} className="hover:underline">
                      {p.name}
                    </Link>
                    <Badge variant="destructive">Over budget</Badge>
                  </li>
                ))
              )}
            </ListCard>
            <ListCard title="Category breakdown">
              {(data.categoryBreakdown ?? []).map((c) => (
                <li key={c.categoryId} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span>{c.categoryName}</span>
                  <span className="tabular-nums">{formatNpr(c.profitLossPaisa, { signed: true })}</span>
                </li>
              ))}
            </ListCard>
            <ListCard title="AMC reminders">
              {(data.amcReminders ?? []).length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">No reminders</p>
              ) : (
                (data.amcReminders ?? []).map((a) => (
                  <li key={a.projectId} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <Link
                      to="/projects/$id"
                      params={{ id: a.projectId }}
                      className="hover:underline"
                    >
                      {a.projectName}
                    </Link>
                    <StatusBadge status={a.status} />
                  </li>
                ))
              )}
            </ListCard>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  )
}

function ListCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">{children}</ul>
      </CardContent>
    </Card>
  )
}
