import * as React from "react"
import { createFileRoute } from "@tanstack/react-router"
import { IconCheck, IconLayoutGrid } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { DashboardGrid } from "@/components/dashboard/dashboard-grid"
import { DateRangeBar, rangeFromDays } from "@/components/dashboard/date-range-bar"
import { ErrorState, LoadingState } from "@/components/ui-states"
import { api, ApiError, type Envelope } from "@/lib/api"
import {
  buildDashboard,
  toIsoDateInput,
  type DateRange,
} from "@/lib/dashboard-metrics"
import type { DashboardSummary, OrgSettings } from "@/lib/types"

export const Route = createFileRoute("/_app/")({
  component: DashboardPage,
})

function DashboardPage() {
  const [preset, setPreset] = React.useState<number | null>(90)
  const [range, setRange] = React.useState<DateRange>(() => rangeFromDays(90))
  const [editing, setEditing] = React.useState(false)
  const [data, setData] = React.useState<DashboardSummary | null>(null)
  const [settings, setSettings] = React.useState<OrgSettings | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        from: toIsoDateInput(range.from),
        to: toIsoDateInput(range.to),
      })
      const [dash, sett] = await Promise.all([
        api<Envelope<DashboardSummary>>(`/dashboard/summary?${params}`),
        api<Envelope<OrgSettings>>("/settings").catch(() => null),
      ])
      setData(dash.data)
      setSettings(sett?.data ?? null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load dashboard")
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [range])

  React.useEffect(() => {
    void load()
  }, [load])

  const dashboardData = React.useMemo(
    () => (data ? buildDashboard(data, settings) : null),
    [data, settings],
  )

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">
            Company pulse
          </p>
          <h1 className="mt-1 text-3xl font-semibold md:text-4xl">Operations Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Projects, AMCs, VAT, stand-ups and people — in one view.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangeBar
            range={range}
            activePreset={preset}
            onPreset={(days) => {
              setPreset(days)
              setRange(rangeFromDays(days))
            }}
            onChange={(r) => {
              setPreset(null)
              setRange(r)
            }}
          />
          <Button
            variant={editing ? "default" : "outline"}
            onClick={() => setEditing((v) => !v)}
            className="gap-2"
          >
            {editing ? <IconCheck className="size-4" /> : <IconLayoutGrid className="size-4" />}
            {editing ? "Done" : "Edit layout"}
          </Button>
        </div>
      </header>

      {loading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}

      {dashboardData && !loading ? (
        <DashboardGrid
          data={dashboardData}
          editing={editing}
          onEditingChange={setEditing}
        />
      ) : null}
    </div>
  )
}
