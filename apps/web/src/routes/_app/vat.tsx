import * as React from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Progress } from "@workspace/ui/components/progress"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Textarea } from "@workspace/ui/components/textarea"
import { PageHeader } from "@/components/page-header"
import { ErrorState } from "@/components/ui-states"
import { api, ApiError, type Envelope } from "@/lib/api"
import { buildListQuery, parseOptionalString } from "@/lib/list-query"
import { formatNpr, paisaToNpr, parseNprInput } from "@/lib/money"
import type {
  VatAccrualEntry,
  VatAccumulated,
  VatClearance,
} from "@/lib/types"

export const Route = createFileRoute("/_app/vat")({
  validateSearch: (search: Record<string, unknown>) => ({
    from: parseOptionalString(search.from),
    to: parseOptionalString(search.to),
  }),
  component: VatPage,
})

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
})

function VatPage() {
  const navigate = Route.useNavigate()
  const { from, to } = Route.useSearch()
  const hasPeriod = Boolean(from || to)

  const [acc, setAcc] = React.useState<VatAccumulated | null>(null)
  const [entries, setEntries] = React.useState<VatAccrualEntry[]>([])
  const [history, setHistory] = React.useState<VatClearance[]>([])
  const [amount, setAmount] = React.useState("")
  const [note, setNote] = React.useState("")
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [formError, setFormError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = buildListQuery({ from, to })
      const suffix = qs ? `?${qs}` : ""
      const [a, e, h] = await Promise.all([
        api<Envelope<VatAccumulated>>(`/vat/accumulated${suffix}`),
        api<Envelope<VatAccrualEntry[]>>("/vat/entries"),
        api<Envelope<VatClearance[]>>("/vat/clearances"),
      ])
      setAcc(a.data)
      setEntries(e.data)
      setHistory(h.data)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load VAT")
    } finally {
      setLoading(false)
    }
  }, [from, to])

  React.useEffect(() => {
    void load()
  }, [load])

  const unpaidPaisa = BigInt(acc?.unpaidPaisa ?? "0")
  const accruedPaisa = BigInt(acc?.accruedPaisa ?? "0")
  const clearedPaisa = BigInt(acc?.clearedPaisa ?? "0")
  const progress =
    accruedPaisa > 0n
      ? Math.min(Number((clearedPaisa * 10000n) / accruedPaisa) / 100, 100)
      : 0

  const stats = hasPeriod && acc?.period
    ? {
        outstanding: acc.period.unpaidPaisa,
        cleared: acc.period.clearedPaisa,
        charged: acc.period.accruedPaisa,
        outstandingLabel: "Outstanding in period",
        clearedLabel: "Cleared in period",
        chargedLabel: "Charged in period",
      }
    : {
        outstanding: acc?.unpaidPaisa ?? "0",
        cleared: acc?.clearedPaisa ?? "0",
        charged: acc?.accruedPaisa ?? "0",
        outstandingLabel: "Accrued (outstanding)",
        clearedLabel: "Cleared to date",
        chargedLabel: "Total VAT charged",
      }

  const unpaidNpr = paisaToNpr(acc?.unpaidPaisa)
  let parsedAmount = 0
  let amountInvalid = true
  try {
    parsedAmount = amount.trim() ? parseNprInput(amount) : 0
    amountInvalid =
      !amount.trim() ||
      parsedAmount <= 0 ||
      parsedAmount > unpaidNpr + 0.001
  } catch {
    amountInvalid = true
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (amountInvalid || unpaidPaisa <= 0n) return
    setSaving(true)
    setFormError(null)
    try {
      await api("/vat/mark-paid", {
        method: "POST",
        body: {
          amountNpr: Number(parsedAmount.toFixed(2)),
          note: note.trim() || undefined,
        },
      })
      setAmount("")
      setNote("")
      await load()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not record clearance")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        title="VAT"
        description="Everything you owe, everything you've settled, and the paper trail in between."
      />

      {error ? <ErrorState message={error} onRetry={load} /> : null}

      {!error ? (
        <>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">From</Label>
              <Input
                type="date"
                className="w-40"
                value={from ?? ""}
                onChange={(e) => {
                  void navigate({
                    search: (prev) => ({
                      ...prev,
                      from: e.target.value || undefined,
                    }),
                  })
                }}
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">To</Label>
              <Input
                type="date"
                className="w-40"
                value={to ?? ""}
                onChange={(e) => {
                  void navigate({
                    search: (prev) => ({
                      ...prev,
                      to: e.target.value || undefined,
                    }),
                  })
                }}
              />
            </div>
            {hasPeriod ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  void navigate({
                    search: { from: undefined, to: undefined },
                  })
                }}
              >
                Reset
              </Button>
            ) : null}
          </div>

          <section className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label={stats.outstandingLabel}
              value={stats.outstanding}
              loading={loading}
              emphasis
            />
            <StatCard
              label={stats.clearedLabel}
              value={stats.cleared}
              loading={loading}
            />
            <StatCard
              label={stats.chargedLabel}
              value={stats.charged}
              loading={loading}
            />
          </section>

          <div className="mt-4">
            {loading ? (
              <Skeleton className="h-2 w-full" />
            ) : (
              <Progress value={progress} className="h-2" />
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              {progress.toFixed(0)}% of charged VAT has been cleared
            </p>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_1.2fr]">
            <Card>
              <CardContent className="pt-6">
                <h2 className="text-xl font-semibold">Clear VAT</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Pay off any part of the outstanding balance.
                </p>

                <form onSubmit={(e) => void handleSubmit(e)} className="mt-5 grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="vat-amount">Amount to clear (NPR)</Label>
                    <Input
                      id="vat-amount"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={amount}
                      maxLength={12}
                      disabled={loading || unpaidPaisa <= 0n}
                      onChange={(e) => setAmount(e.target.value)}
                      className="text-lg tabular-nums"
                    />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Outstanding {formatNpr(acc?.unpaidPaisa)}</span>
                      <button
                        type="button"
                        className="font-medium text-primary underline-offset-4 hover:underline disabled:opacity-50"
                        disabled={loading || unpaidPaisa <= 0n}
                        onClick={() => setAmount(unpaidNpr.toFixed(2))}
                      >
                        Clear full amount
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="vat-note">Note (optional)</Label>
                    <Textarea
                      id="vat-note"
                      rows={3}
                      maxLength={500}
                      placeholder="e.g. Q2 return paid by bank transfer"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={amountInvalid || saving || unpaidPaisa <= 0n}
                  >
                    {saving ? "Recording…" : "Record clearance"}
                  </Button>
                  {amount.trim() && amountInvalid ? (
                    <p className="text-xs text-destructive">
                      Enter an amount between 0 and {formatNpr(acc?.unpaidPaisa)}.
                    </p>
                  ) : null}
                  {formError ? (
                    <p className="text-xs text-destructive">{formError}</p>
                  ) : null}
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <h2 className="text-xl font-semibold">Clearance history</h2>
                <div className="mt-4">
                  {loading ? (
                    <div className="grid gap-3">
                      {[0, 1, 2].map((i) => (
                        <Skeleton key={i} className="h-14 w-full" />
                      ))}
                    </div>
                  ) : history.length > 0 ? (
                    <ul className="divide-y divide-border">
                      {history.map((c) => (
                        <li
                          key={c.id}
                          className="flex items-start justify-between gap-4 py-4"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium">
                              {dateFmt.format(
                                new Date(c.clearedAt ?? c.createdAt),
                              )}
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {c.note ? (
                                c.note
                              ) : (
                                <span className="italic">No note</span>
                              )}
                            </p>
                            {c.clearedBy?.name ? (
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                by {c.clearedBy.name}
                              </p>
                            ) : null}
                          </div>
                          <span className="shrink-0 text-base tabular-nums text-primary">
                            −{formatNpr(c.amountPaisa)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="py-8 text-sm text-muted-foreground">
                      No clearances recorded yet.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <section className="mt-10">
            <h2 className="text-xl font-semibold">Accrued VAT</h2>
            <Card className="mt-4 overflow-hidden py-0">
              {loading ? (
                <div className="grid gap-3 p-6">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {entries.map((e) => (
                    <li
                      key={e.id}
                      className="flex items-center justify-between gap-4 px-6 py-4"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{e.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {dateFmt.format(new Date(`${e.occurredAt}T00:00:00`))}
                        </p>
                      </div>
                      <span className="shrink-0 text-base tabular-nums">
                        {formatNpr(e.amountPaisa)}
                      </span>
                    </li>
                  ))}
                  {entries.length === 0 ? (
                    <li className="px-6 py-8 text-sm text-muted-foreground">
                      No VAT accrued yet.
                    </li>
                  ) : null}
                </ul>
              )}
            </Card>
          </section>
        </>
      ) : null}
    </>
  )
}

function StatCard({
  label,
  value,
  loading,
  emphasis,
}: {
  label: string
  value: string
  loading: boolean
  emphasis?: boolean
}) {
  return (
    <Card
      className={
        emphasis
          ? "border-primary/30 bg-primary text-primary-foreground"
          : undefined
      }
    >
      <CardContent className="pt-5">
        <p
          className={`text-xs font-medium uppercase tracking-wide ${
            emphasis ? "text-primary-foreground/75" : "text-muted-foreground"
          }`}
        >
          {label}
        </p>
        {loading ? (
          <Skeleton className="mt-3 h-9 w-32" />
        ) : (
          <p className="mt-2 text-3xl font-semibold tabular-nums">
            {formatNpr(value)}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
