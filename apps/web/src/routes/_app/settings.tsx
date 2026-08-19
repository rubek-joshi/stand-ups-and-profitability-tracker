import * as React from "react"
import { createFileRoute } from "@tanstack/react-router"
import { IconAlertTriangle } from "@tabler/icons-react"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Switch } from "@workspace/ui/components/switch"
import { PageHeader } from "@/components/page-header"
import { PasswordInput } from "@/components/password-input"
import { useConfirmDialog } from "@/components/confirm-dialog"
import { ErrorState, LoadingState } from "@/components/ui-states"
import { api, ApiError, type Envelope } from "@/lib/api"
import type { OrgSettings } from "@/lib/types"

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
})

const emptySmtpForm = {
  smtpHost: "",
  smtpPort: "587",
  smtpSecure: false,
  smtpUser: "",
  smtpPass: "",
  smtpFrom: "",
}

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
  const [smtpForm, setSmtpForm] = React.useState(emptySmtpForm)
  const [testTo, setTestTo] = React.useState("")
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [savingSmtp, setSavingSmtp] = React.useState(false)
  const [testingSmtp, setTestingSmtp] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [message, setMessage] = React.useState<string | null>(null)
  const [smtpMessage, setSmtpMessage] = React.useState<string | null>(null)

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
      setSmtpForm({
        smtpHost: res.data.smtpHost ?? "",
        smtpPort: String(res.data.smtpPort ?? 587),
        smtpSecure: Boolean(res.data.smtpSecure),
        smtpUser: res.data.smtpUser ?? "",
        smtpPass: "",
        smtpFrom: res.data.smtpFrom ?? "",
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

  function applySettings(data: OrgSettings) {
    setSettings(data)
    setForm({
      vatRatePercent: String(data.vatRatePercent),
      paidLeaveDaysPerMonth: String(data.paidLeaveDaysPerMonth),
      amcReminderLeadDays: String(data.amcReminderLeadDays),
      healthHealthyMinPercent: String(data.healthHealthyMinPercent),
      healthAtRiskMinPercent: String(data.healthAtRiskMinPercent),
    })
    setSmtpForm({
      smtpHost: data.smtpHost ?? "",
      smtpPort: String(data.smtpPort ?? 587),
      smtpSecure: Boolean(data.smtpSecure),
      smtpUser: data.smtpUser ?? "",
      smtpPass: "",
      smtpFrom: data.smtpFrom ?? "",
    })
  }

  async function saveSmtp() {
    const res = await api<Envelope<OrgSettings>>("/settings", {
      method: "PATCH",
      body: {
        smtpHost: smtpForm.smtpHost.trim() || null,
        smtpPort: Number(smtpForm.smtpPort) || 587,
        smtpSecure: smtpForm.smtpSecure,
        smtpUser: smtpForm.smtpUser.trim() || null,
        smtpFrom: smtpForm.smtpFrom.trim() || null,
        ...(smtpForm.smtpPass ? { smtpPass: smtpForm.smtpPass } : {}),
      },
    })
    applySettings(res.data)
    return res.data
  }

  if (loading) return <LoadingState />
  if (error) return <ErrorState message={error} onRetry={load} />

  const smtpConfigured = Boolean(settings?.smtpHost?.trim())

  return (
    <div>
      <PageHeader title="Settings" description="Organization configuration" />
      {!smtpConfigured ? (
        <Alert className="mb-6">
          <IconAlertTriangle />
          <AlertTitle>SMTP is not configured</AlertTitle>
          <AlertDescription>
            Outgoing mail will not be sent until you save an SMTP host below.
          </AlertDescription>
        </Alert>
      ) : null}
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

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">SMTP</CardTitle>
            <CardDescription>
              Outgoing mail for this organization. Leave the password blank to keep the saved value.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-col gap-6"
              onSubmit={async (e) => {
                e.preventDefault()
                setSavingSmtp(true)
                setSmtpMessage(null)
                try {
                  await saveSmtp()
                  setSmtpMessage("SMTP settings saved.")
                } catch (err) {
                  alert(err instanceof ApiError ? err.message : "Save failed")
                } finally {
                  setSavingSmtp(false)
                }
              }}
            >
              <FieldGroup className="gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="smtpHost">Host</FieldLabel>
                    <Input
                      id="smtpHost"
                      value={smtpForm.smtpHost}
                      onChange={(e) =>
                        setSmtpForm((f) => ({ ...f, smtpHost: e.target.value }))
                      }
                      placeholder="smtp.example.com"
                      autoComplete="off"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="smtpPort">Port</FieldLabel>
                    <Input
                      id="smtpPort"
                      type="number"
                      min={1}
                      max={65535}
                      value={smtpForm.smtpPort}
                      onChange={(e) =>
                        setSmtpForm((f) => ({ ...f, smtpPort: e.target.value }))
                      }
                    />
                  </Field>
                </div>
                <Field orientation="horizontal">
                  <FieldLabel htmlFor="smtpSecure">Secure connection (TLS)</FieldLabel>
                  <Switch
                    id="smtpSecure"
                    checked={smtpForm.smtpSecure}
                    onCheckedChange={(checked) =>
                      setSmtpForm((f) => ({ ...f, smtpSecure: Boolean(checked) }))
                    }
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="smtpUser">Username</FieldLabel>
                    <Input
                      id="smtpUser"
                      value={smtpForm.smtpUser}
                      onChange={(e) =>
                        setSmtpForm((f) => ({ ...f, smtpUser: e.target.value }))
                      }
                      autoComplete="off"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="smtpPass">Password</FieldLabel>
                    <PasswordInput
                      id="smtpPass"
                      value={smtpForm.smtpPass}
                      onChange={(e) =>
                        setSmtpForm((f) => ({ ...f, smtpPass: e.target.value }))
                      }
                      autoComplete="new-password"
                      placeholder={
                        settings?.smtpPassSet ? "Saved — type to replace" : undefined
                      }
                    />
                    {settings?.smtpPassSet ? (
                      <FieldDescription>A password is already saved.</FieldDescription>
                    ) : null}
                  </Field>
                </div>
                <Field>
                  <FieldLabel htmlFor="smtpFrom">From address</FieldLabel>
                  <Input
                    id="smtpFrom"
                    type="email"
                    value={smtpForm.smtpFrom}
                    onChange={(e) =>
                      setSmtpForm((f) => ({ ...f, smtpFrom: e.target.value }))
                    }
                    placeholder="noreply@example.com"
                  />
                </Field>
              </FieldGroup>
              {smtpMessage ? (
                <p className="text-sm text-muted-foreground">{smtpMessage}</p>
              ) : null}
              <div>
                <Button type="submit" disabled={savingSmtp || testingSmtp}>
                  {savingSmtp ? "Saving…" : "Save SMTP"}
                </Button>
              </div>
              <FieldGroup className="gap-4 border-t pt-4">
                <Field>
                  <FieldLabel htmlFor="smtp-test-to">Test recipient</FieldLabel>
                  <Input
                    id="smtp-test-to"
                    type="email"
                    value={testTo}
                    onChange={(e) => setTestTo(e.target.value)}
                    placeholder="you@example.com"
                  />
                  <FieldDescription>
                    Sends a test message using the saved SMTP settings.
                  </FieldDescription>
                </Field>
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={savingSmtp || testingSmtp || !testTo.trim()}
                    onClick={async () => {
                      const to = testTo.trim()
                      const ok = await confirm({
                        title: "Send test email?",
                        description: `A test email will be sent to ${to}. Type I understand because this message will be delivered to that recipient.`,
                        confirmLabel: "Send test email",
                        confirmPhrase: "I understand",
                      })
                      if (!ok) return
                      setTestingSmtp(true)
                      setSmtpMessage(null)
                      try {
                        await saveSmtp()
                        await api("/settings/smtp/test", {
                          method: "POST",
                          body: { to },
                        })
                        setSmtpMessage(`Test email sent to ${to}.`)
                      } catch (err) {
                        alert(
                          err instanceof ApiError
                            ? err.message
                            : "Failed to send test email",
                        )
                      } finally {
                        setTestingSmtp(false)
                      }
                    }}
                  >
                    {testingSmtp ? "Sending…" : "Send test email"}
                  </Button>
                </div>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      </div>
      {dialog}
    </div>
  )
}
