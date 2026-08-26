import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts"
import { IconAlertTriangle, IconCalendarClock, IconClock, IconTrendingUp } from "@tabler/icons-react"
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@workspace/ui/components/chart"
import type { ChartConfig } from "@workspace/ui/components/chart"
import {
  buildMonthlyInvoiceSeries,
  computeInvoiceAnalytics,
  paymentDurationSeries,
} from "@/lib/invoice-analytics"
import { formatNpr, paisaToNpr } from "@/lib/money"
import type { Invoice } from "@/lib/types"

const monthlyConfig = {
  invoiced: { label: "Invoiced", color: "var(--chart-1)" },
  paid: { label: "Paid", color: "var(--chart-2)" },
} satisfies ChartConfig

const durationConfig = {
  days: { label: "Days", color: "var(--chart-4)" },
} satisfies ChartConfig

function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof IconClock
  label: string
  value: string
  sub?: string
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon className="size-4" />
          {label}
        </div>
        <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
        {sub ? <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div> : null}
      </CardContent>
    </Card>
  )
}

export function InvoiceAnalytics({ invoices }: { invoices: Invoice[] }) {
  const analytics = computeInvoiceAnalytics(invoices)
  const monthly = buildMonthlyInvoiceSeries(invoices)
  const durations = paymentDurationSeries(invoices)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard
          icon={IconClock}
          label="Avg payment time"
          value={
            analytics.avgPaymentDays !== null
              ? `${analytics.avgPaymentDays} days`
              : "—"
          }
          sub="invoice → payment"
        />
        <MetricCard
          icon={IconCalendarClock}
          label="Avg invoice gap"
          value={
            analytics.avgInvoiceGap !== null
              ? `${analytics.avgInvoiceGap} days`
              : "—"
          }
          sub="between invoices"
        />
        <MetricCard
          icon={IconTrendingUp}
          label="Total paid"
          value={formatNpr(analytics.totalPaidPaisa)}
        />
        <MetricCard
          icon={IconAlertTriangle}
          label="Overdue invoices"
          value={String(analytics.overdueInvoices.length)}
          sub="pending > 15 days"
        />
      </div>

      {monthly.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Invoiced vs paid (monthly)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={monthlyConfig} className="aspect-auto h-60 w-full">
              <BarChart data={monthly} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="month" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) =>
                    `${Math.round(paisaToNpr(Number(value)) / 1000)}k`
                  }
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => formatNpr(Number(value ?? 0))}
                    />
                  }
                />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="invoiced" fill="var(--color-invoiced)" radius={4} />
                <Bar dataKey="paid" fill="var(--color-paid)" radius={4} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      ) : null}

      {durations.length > 1 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Days to payment per invoice
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={durationConfig} className="aspect-auto h-55 w-full">
              <LineChart data={durations} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="name" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line
                  type="monotone"
                  dataKey="days"
                  stroke="var(--color-days)"
                  strokeWidth={2}
                  dot
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
