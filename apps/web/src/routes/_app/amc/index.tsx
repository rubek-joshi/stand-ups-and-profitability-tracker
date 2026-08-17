import * as React from "react"
import { createFileRoute } from "@tanstack/react-router"
import {
  IconAlertTriangle,
  IconCalendarClock,
  IconShieldCheck,
  IconWallet,
} from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import { AmcCard } from "@/components/amc/amc-card"
import { CreateAmcDialog } from "@/components/amc/create-amc-dialog"
import { DeclineAmcDialog } from "@/components/amc/decline-amc-dialog"
import { PageHeader } from "@/components/page-header"
import { ErrorState, LoadingState, EmptyState } from "@/components/ui-states"
import { api, ApiError, type PaginatedEnvelope } from "@/lib/api"
import { amcDisplayStatus } from "@/lib/amc"
import { formatNpr } from "@/lib/money"
import type { AmcRecord } from "@/lib/types"

export const Route = createFileRoute("/_app/amc/")({
  component: AmcPage,
})

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof IconShieldCheck
  label: string
  value: number | string
  hint: string
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="size-4" />
          <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
        </div>
        <p className="mt-3 text-3xl font-semibold tabular-nums">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  )
}

function AmcPage() {
  const [amcs, setAmcs] = React.useState<AmcRecord[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [presetProjectId, setPresetProjectId] = React.useState<string | undefined>()
  const [declineAmc, setDeclineAmc] = React.useState<AmcRecord | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api<PaginatedEnvelope<AmcRecord[]>>("/amc")
      setAmcs(res.data)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load AMCs")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  const groups = React.useMemo(() => {
    const withStatus = amcs.map((a) => ({ amc: a, status: amcDisplayStatus(a) }))
    return {
      ongoing: withStatus.filter(
        (x) => x.status === "ongoing" || x.status === "expiring",
      ),
      upcoming: withStatus.filter((x) => x.status === "upcoming"),
      attention: withStatus.filter(
        (x) => x.status === "awaiting-decision" || x.status === "expiring",
      ),
      expired: withStatus.filter((x) => x.status === "expired"),
      all: withStatus,
    }
  }, [amcs])

  const paidValuePaisa = amcs
    .filter((a) => a.type === "paid" && amcDisplayStatus(a) !== "expired")
    .reduce((sum, a) => sum + BigInt(a.amcAmountPaisa ?? "0"), 0n)

  const handleRenew = async (amc: AmcRecord) => {
    try {
      await api(`/amc/${amc.id}/renewal-decision`, {
        method: "POST",
        body: { decision: "renewed" },
      })
      setPresetProjectId(amc.projectId)
      setCreateOpen(true)
      await load()
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "Failed to mark renewal")
    }
  }

  const handleDecline = (amc: AmcRecord) => {
    setDeclineAmc(amc)
  }

  const submitDecline = async (remark?: string) => {
    if (!declineAmc) return
    try {
      await api(`/amc/${declineAmc.id}/renewal-decision`, {
        method: "POST",
        body: {
          decision: "declined",
          ...(remark ? { remark } : {}),
        },
      })
      setDeclineAmc(null)
      await load()
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "Failed to decline renewal")
      throw e
    }
  }

  const list = (items: { amc: AmcRecord }[], empty: string) =>
    items.length ? (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map(({ amc }) => (
          <AmcCard
            key={amc.id}
            amc={amc}
            onRenew={(a) => void handleRenew(a)}
            onDecline={(a) => void handleDecline(a)}
          />
        ))}
      </div>
    ) : (
      <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
        {empty}
      </div>
    )

  return (
    <div>
      <PageHeader
        title="AMC"
        description="Complimentary periods, renewal follow-ups, and paid maintenance contracts."
        actions={
          <Button
            onClick={() => {
              setPresetProjectId(undefined)
              setCreateOpen(true)
            }}
          >
            New AMC
          </Button>
        }
      />

      {loading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && !error ? (
        <>
          <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={IconShieldCheck}
              label="Active AMCs"
              value={groups.ongoing.length}
              hint="Currently under maintenance"
            />
            <StatCard
              icon={IconCalendarClock}
              label="Upcoming"
              value={groups.upcoming.length}
              hint="Scheduled to start"
            />
            <StatCard
              icon={IconAlertTriangle}
              label="Needs follow-up"
              value={groups.attention.length}
              hint="Expiring or awaiting client decision"
            />
            <StatCard
              icon={IconWallet}
              label="Paid AMC value"
              value={formatNpr(String(paidValuePaisa))}
              hint="Across live paid contracts"
            />
          </section>

          {amcs.length === 0 ? (
            <EmptyState message="No AMCs yet — create one for a closed project." />
          ) : (
            <Tabs defaultValue="ongoing">
              <TabsList>
                <TabsTrigger value="ongoing">
                  Ongoing ({groups.ongoing.length})
                </TabsTrigger>
                <TabsTrigger value="upcoming">
                  Upcoming ({groups.upcoming.length})
                </TabsTrigger>
                <TabsTrigger value="attention">
                  Follow-up ({groups.attention.length})
                </TabsTrigger>
                <TabsTrigger value="all">All ({groups.all.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="ongoing" className="mt-6">
                {list(groups.ongoing, "No AMCs are currently running.")}
              </TabsContent>
              <TabsContent value="upcoming" className="mt-6">
                {list(
                  groups.upcoming,
                  "Nothing scheduled yet — create an AMC to plan ahead.",
                )}
              </TabsContent>
              <TabsContent value="attention" className="mt-6">
                {list(groups.attention, "All clear. No renewals pending.")}
              </TabsContent>
              <TabsContent value="all" className="mt-6">
                {list(groups.all, "No AMCs yet.")}
              </TabsContent>
            </Tabs>
          )}
        </>
      ) : null}

      <CreateAmcDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        presetProjectId={presetProjectId}
        onCreated={() => void load()}
      />
      <DeclineAmcDialog
        amc={declineAmc}
        open={Boolean(declineAmc)}
        onOpenChange={(open) => {
          if (!open) setDeclineAmc(null)
        }}
        onConfirm={submitDecline}
      />
    </div>
  )
}
