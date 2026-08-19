import * as React from "react"
import { createFileRoute } from "@tanstack/react-router"
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconDatabase,
  IconDeviceFloppy,
  IconDownload,
  IconMail,
  IconSend,
  IconShield,
} from "@tabler/icons-react"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Separator } from "@workspace/ui/components/separator"
import { Spinner } from "@workspace/ui/components/spinner"
import { Switch } from "@workspace/ui/components/switch"
import { PageHeader } from "@/components/page-header"
import { PasswordInput } from "@/components/password-input"
import { useConfirmDialog } from "@/components/confirm-dialog"
import { NumberField } from "@/components/settings/number-field"
import { ErrorState, LoadingState } from "@/components/ui-states"
import { api, ApiError, type Envelope } from "@/lib/api"
import type { OrgSettings } from "@/lib/types"

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
})

const emptySmtpForm = {
  smtpHost: "",
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: "",
  smtpPass: "",
  smtpFrom: "",
}

type OrgForm = {
  vatRatePercent: number
  paidLeaveDaysPerMonth: number
  amcReminderLeadDays: number
  healthHealthyMinPercent: number
  healthAtRiskMinPercent: number
}

type SnapshotMeta = {
  fileName: string
  filePath: string
  sizeBytes: string
  createdAt?: string
}

function smtpFingerprint(form: typeof emptySmtpForm) {
  return JSON.stringify({
    host: form.smtpHost.trim(),
    port: Number.isFinite(form.smtpPort) ? form.smtpPort : 587,
    secure: form.smtpSecure,
    user: form.smtpUser.trim(),
    from: form.smtpFrom.trim(),
    pass: form.smtpPass,
  })
}

function formatSnapshotSize(sizeBytes: string) {
  const bytes = Number(sizeBytes)
  if (!Number.isFinite(bytes)) return sizeBytes
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}

function SettingsPage() {
  const { confirm, dialog } = useConfirmDialog()
  const [settings, setSettings] = React.useState<OrgSettings | null>(null)
  const [form, setForm] = React.useState<OrgForm>({
    vatRatePercent: 13,
    paidLeaveDaysPerMonth: 0,
    amcReminderLeadDays: 0,
    healthHealthyMinPercent: 20,
    healthAtRiskMinPercent: 0,
  })
  const [smtpForm, setSmtpForm] = React.useState(emptySmtpForm)
  const [testTo, setTestTo] = React.useState("")
  const [verifiedSmtp, setVerifiedSmtp] = React.useState<string | null>(null)
  const [testResult, setTestResult] = React.useState<{
    ok: boolean
    message: string
  } | null>(null)
  const [snapshot, setSnapshot] = React.useState<SnapshotMeta | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [savingSmtp, setSavingSmtp] = React.useState(false)
  const [testingSmtp, setTestingSmtp] = React.useState(false)
  const [snapshotting, setSnapshotting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [message, setMessage] = React.useState<string | null>(null)
  const [smtpMessage, setSmtpMessage] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api<Envelope<OrgSettings>>("/settings")
      applySettings(res.data)
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
      vatRatePercent: data.vatRatePercent,
      paidLeaveDaysPerMonth: data.paidLeaveDaysPerMonth,
      amcReminderLeadDays: data.amcReminderLeadDays,
      healthHealthyMinPercent: data.healthHealthyMinPercent,
      healthAtRiskMinPercent: data.healthAtRiskMinPercent,
    })
    setSmtpForm({
      smtpHost: data.smtpHost ?? "",
      smtpPort: data.smtpPort ?? 587,
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
        smtpPort: Number.isFinite(smtpForm.smtpPort) ? smtpForm.smtpPort : 587,
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
  const smtpVerified = verifiedSmtp === smtpFingerprint(smtpForm)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Settings"
        description="Organization-wide defaults, mail delivery and data snapshots."
      />
      {!smtpConfigured ? (
        <a
          href="#smtp-settings"
          className="block rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          onClick={(e) => {
            e.preventDefault()
            document
              .getElementById("smtp-settings")
              ?.scrollIntoView({ behavior: "smooth", block: "start" })
          }}
        >
          <Alert className="cursor-pointer transition-colors hover:bg-muted/50">
            <IconAlertTriangle />
            <AlertTitle>SMTP is not configured</AlertTitle>
            <AlertDescription>
              Outgoing mail will not be sent until you save an SMTP host. Click
              to jump to SMTP configuration.
            </AlertDescription>
          </Alert>
        </a>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Organization</CardTitle>
          <CardDescription>
            Financial and operational defaults applied across projects.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            id="org-settings-form"
            className="grid gap-5 sm:grid-cols-2"
            onSubmit={async (e) => {
              e.preventDefault()
              setSaving(true)
              setMessage(null)
                try {
                  const res = await api<Envelope<OrgSettings>>("/settings", {
                    method: "PATCH",
                    body: {
                      vatRatePercent: form.vatRatePercent,
                      paidLeaveDaysPerMonth: form.paidLeaveDaysPerMonth,
                      amcReminderLeadDays: form.amcReminderLeadDays,
                      healthHealthyMinPercent: form.healthHealthyMinPercent,
                      healthAtRiskMinPercent: form.healthAtRiskMinPercent,
                    },
                  })
                  applySettings(res.data)
                  setMessage("Organization settings saved.")
              } catch (err) {
                alert(err instanceof ApiError ? err.message : "Save failed")
              } finally {
                setSaving(false)
              }
            }}
          >
            <NumberField
              id="vat"
              label="VAT"
              suffix="%"
              value={form.vatRatePercent}
              onChange={(v) => setForm((f) => ({ ...f, vatRatePercent: v }))}
              hint="Applied to invoices and quotations."
            />
            <NumberField
              id="leave"
              label="Paid leave days / month"
              suffix="days"
              value={form.paidLeaveDaysPerMonth}
              onChange={(v) =>
                setForm((f) => ({ ...f, paidLeaveDaysPerMonth: v }))
              }
              hint="Accrual rate per employee per month."
            />
            <NumberField
              id="amc"
              label="AMC reminder lead"
              suffix="days"
              value={form.amcReminderLeadDays}
              onChange={(v) =>
                setForm((f) => ({ ...f, amcReminderLeadDays: v }))
              }
              hint="How early renewal reminders are triggered."
            />
            <div className="hidden sm:block" />
            <NumberField
              id="healthy"
              label="Healthy margin ≥"
              suffix="%"
              value={form.healthHealthyMinPercent}
              onChange={(v) =>
                setForm((f) => ({ ...f, healthHealthyMinPercent: v }))
              }
              hint="Projects at or above this margin are flagged healthy."
            />
            <NumberField
              id="atrisk"
              label="At-risk margin ≥"
              suffix="%"
              value={form.healthAtRiskMinPercent}
              onChange={(v) =>
                setForm((f) => ({ ...f, healthAtRiskMinPercent: v }))
              }
              hint="Below this margin, projects are flagged critical."
            />
          </form>
        </CardContent>
        <CardFooter className="justify-end border-t">
          <div className="flex flex-wrap items-center justify-end gap-3">
            {message ? (
              <p className="text-sm text-muted-foreground">{message}</p>
            ) : null}
            <Button type="submit" form="org-settings-form" disabled={saving}>
              {saving ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <IconDeviceFloppy data-icon="inline-start" />
              )}
              Save organization settings
            </Button>
          </div>
        </CardFooter>
      </Card>

      <Card id="smtp-settings" className="scroll-mt-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconMail className="size-4 text-primary" />
            SMTP configuration
          </CardTitle>
          <CardDescription>
            Settings can only be saved after a successful test email.
          </CardDescription>
          <CardAction>
            {smtpVerified ? (
              <Badge>
                <IconCircleCheck data-icon="inline-start" />
                Verified
              </Badge>
            ) : (
              <Badge variant="outline">
                <IconShield data-icon="inline-start" />
                Not verified
              </Badge>
            )}
          </CardAction>
        </CardHeader>
        <CardContent>
          <FieldGroup className="gap-5">
            <div className="grid gap-5 sm:grid-cols-3">
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="smtpHost">Host</FieldLabel>
                <Input
                  id="smtpHost"
                  placeholder="smtp.yourcompany.com"
                  value={smtpForm.smtpHost}
                  onChange={(e) =>
                    setSmtpForm((f) => ({ ...f, smtpHost: e.target.value }))
                  }
                  autoComplete="off"
                />
              </Field>
              <NumberField
                id="smtpPort"
                label="Port"
                min={1}
                max={65535}
                value={smtpForm.smtpPort}
                onChange={(v) => setSmtpForm((f) => ({ ...f, smtpPort: v }))}
              />
              <Field>
                <FieldLabel htmlFor="smtpUser">Username</FieldLabel>
                <Input
                  id="smtpUser"
                  autoComplete="off"
                  value={smtpForm.smtpUser}
                  onChange={(e) =>
                    setSmtpForm((f) => ({ ...f, smtpUser: e.target.value }))
                  }
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
              <Field>
                <FieldLabel htmlFor="smtpFrom">From address</FieldLabel>
                <Input
                  id="smtpFrom"
                  type="email"
                  placeholder="no-reply@yourcompany.com"
                  value={smtpForm.smtpFrom}
                  onChange={(e) =>
                    setSmtpForm((f) => ({ ...f, smtpFrom: e.target.value }))
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
          </FieldGroup>

          <Separator className="my-5" />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field className="flex-1">
              <FieldLabel htmlFor="smtp-test-to">Send test email to</FieldLabel>
              <Input
                id="smtp-test-to"
                type="email"
                placeholder="you@yourcompany.com"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
              />
            </Field>
            <Button
              type="button"
              disabled={testingSmtp || savingSmtp || !testTo.trim()}
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
                setTestResult(null)
                setSmtpMessage(null)
                try {
                  await saveSmtp()
                  await api("/settings/smtp/test", {
                    method: "POST",
                    body: { to },
                  })
                  setVerifiedSmtp(smtpFingerprint({ ...smtpForm, smtpPass: "" }))
                  setTestResult({
                    ok: true,
                    message: `Test delivery succeeded. A message was sent to ${to}.`,
                  })
                } catch (err) {
                  setVerifiedSmtp(null)
                  setTestResult({
                    ok: false,
                    message:
                      err instanceof ApiError
                        ? err.message
                        : "Failed to send test email",
                  })
                } finally {
                  setTestingSmtp(false)
                }
              }}
            >
              {testingSmtp ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <IconSend data-icon="inline-start" />
              )}
              Send test email
            </Button>
          </div>

          {testResult ? (
            <Alert
              className="mt-5"
              variant={testResult.ok ? "default" : "destructive"}
            >
              {testResult.ok ? <IconCircleCheck /> : <IconAlertTriangle />}
              <AlertTitle>
                {testResult.ok
                  ? "Test delivery succeeded"
                  : "Test delivery failed"}
              </AlertTitle>
              <AlertDescription>{testResult.message}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
        <CardFooter className="flex-wrap justify-between gap-3 border-t">
          <p className="text-xs text-muted-foreground">
            {smtpMessage
              ? smtpMessage
              : smtpVerified
                ? "SMTP verified — configuration can be saved."
                : "Send a successful test email to enable saving."}
          </p>
          <Button
            type="button"
            disabled={!smtpVerified || savingSmtp || testingSmtp}
            onClick={async () => {
              setSavingSmtp(true)
              setSmtpMessage(null)
              try {
                await saveSmtp()
                setSmtpMessage("SMTP configuration saved.")
              } catch (err) {
                alert(err instanceof ApiError ? err.message : "Save failed")
              } finally {
                setSavingSmtp(false)
              }
            }}
          >
            {savingSmtp ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <IconDeviceFloppy data-icon="inline-start" />
            )}
            Save SMTP configuration
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconDatabase className="size-4 text-primary" />
            Database snapshot
          </CardTitle>
          <CardDescription>
            Download a snapshot of the current database state. Generating a new
            snapshot replaces the previous one.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">Last snapshot</p>
            <p className="text-muted-foreground">
              {snapshot
                ? `${snapshot.createdAt ? `${new Date(snapshot.createdAt).toLocaleString()} · ` : ""}${snapshot.fileName} · ${formatSnapshotSize(snapshot.sizeBytes)}`
                : "No snapshot generated yet this session."}
            </p>
          </div>
          <Button
            variant="outline"
            disabled={snapshotting}
            onClick={async () => {
              const ok = await confirm({
                title: "Generate a new snapshot?",
                description:
                  "Generating a new snapshot will replace and permanently delete the existing one.",
                confirmLabel: "Generate",
                destructive: true,
              })
              if (!ok) return
              setSnapshotting(true)
              try {
                const res = await api<Envelope<SnapshotMeta>>(
                  "/snapshots/download",
                  { method: "POST" },
                )
                setSnapshot(res.data)
              } catch (err) {
                alert(err instanceof ApiError ? err.message : "Snapshot failed")
              } finally {
                setSnapshotting(false)
              }
            }}
          >
            {snapshotting ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <IconDownload data-icon="inline-start" />
            )}
            Generate snapshot
          </Button>
        </CardContent>
      </Card>
      {dialog}
    </div>
  )
}
