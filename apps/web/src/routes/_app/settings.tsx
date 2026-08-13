import * as React from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { PageHeader } from "@/components/page-header"
import { useConfirmDialog } from "@/components/confirm-dialog"
import { ErrorState, LoadingState } from "@/components/ui-states"
import { api, ApiError, type Envelope } from "@/lib/api"
import type { OrgSettings } from "@/lib/types"

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
})

function SettingsPage() {
  const { confirm, dialog } = useConfirmDialog()
  const [settings, setSettings] = React.useState<OrgSettings | null>(null)
  const [form, setForm] = React.useState({
    vatRatePercent: "13",
    paidLeaveDaysPerMonth: "0",
    amcReminderLeadDays: "0",
    healthHealthyMinPercent: "20",
    healthAtRiskMinPercent: "0",
  })
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [message, setMessage] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api<Envelope<OrgSettings>>("/settings")
      setSettings(res.data)
      setForm({
        vatRatePercent: String(res.data.vatRatePercent),
        paidLeaveDaysPerMonth: String(res.data.paidLeaveDaysPerMonth),
        amcReminderLeadDays: String(res.data.amcReminderLeadDays),
        healthHealthyMinPercent: String(res.data.healthHealthyMinPercent),
        healthAtRiskMinPercent: String(res.data.healthAtRiskMinPercent),
      })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load settings")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  if (loading) return <LoadingState />
  if (error) return <ErrorState message={error} onRetry={load} />

  return (
    <div>
      <PageHeader title="Settings" description="Organization configuration" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Org settings</CardTitle>
            <CardDescription>VAT, leave, AMC lead time, and health thresholds.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault()
                setSaving(true)
                setMessage(null)
                try {
                  await api("/settings", {
                    method: "PATCH",
                    body: {
                      vatRatePercent: Number(form.vatRatePercent),
                      paidLeaveDaysPerMonth: Number(form.paidLeaveDaysPerMonth),
                      amcReminderLeadDays: Number(form.amcReminderLeadDays),
                      healthHealthyMinPercent: Number(form.healthHealthyMinPercent),
                      healthAtRiskMinPercent: Number(form.healthAtRiskMinPercent),
                    },
                  })
                  setMessage("Settings saved.")
                  await load()
                } catch (err) {
                  alert(err instanceof ApiError ? err.message : "Save failed")
                } finally {
                  setSaving(false)
                }
              }}
            >
              {(
                [
                  ["vatRatePercent", "VAT rate %"],
                  ["paidLeaveDaysPerMonth", "Paid leave days / month"],
                  ["amcReminderLeadDays", "AMC reminder lead days"],
                  ["healthHealthyMinPercent", "Healthy margin ≥ %"],
                  ["healthAtRiskMinPercent", "At-risk margin ≥ %"],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="space-y-2">
                  <Label htmlFor={key}>{label}</Label>
                  <Input
                    id={key}
                    type="number"
                    value={form[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  />
                </div>
              ))}
              {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save settings"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Database snapshot</CardTitle>
            <CardDescription>
              Super admin only. Generating a new snapshot replaces the previous one.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={async () => {
                const ok = await confirm({
                  title: "Download new snapshot?",
                  description:
                    "Downloading a new snapshot will replace and permanently delete the existing one.",
                  confirmLabel: "Download",
                  destructive: true,
                })
                if (!ok) return
                try {
                  const res = await api<
                    Envelope<{ id: string; fileName: string; filePath: string; sizeBytes: string }>
                  >("/snapshots/download", { method: "POST" })
                  alert(
                    `Snapshot ready: ${res.data.fileName} (${res.data.sizeBytes} bytes)\n${res.data.filePath}`,
                  )
                } catch (err) {
                  alert(err instanceof ApiError ? err.message : "Snapshot failed")
                }
              }}
            >
              Download snapshot
            </Button>
            {settings ? (
              <p className="mt-4 text-xs text-muted-foreground">Settings id: {settings.id}</p>
            ) : null}
          </CardContent>
        </Card>
      </div>
      {dialog}
    </div>
  )
}
