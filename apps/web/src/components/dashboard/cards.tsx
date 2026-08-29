import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  IconArrowDownRight,
  IconArrowUpRight,
  IconCalendarClock,
  IconCheck,
  IconMessages,
  IconPercentage,
  IconReceipt,
  IconFileText,
  IconShieldCheck,
  IconTrendingUp,
  IconUsers,
  IconWallet,
} from "@tabler/icons-react"
import { format, parseISO } from "date-fns"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis } from "recharts"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@workspace/ui/components/chart"
import { buttonVariants } from "@workspace/ui/components/button"
import { Progress } from "@workspace/ui/components/progress"
import { HealthBadge, StatusBadge } from "@/components/health-badge"
import type { DashboardData } from "@/lib/dashboard-metrics"
import { relativeTime } from "@/lib/dashboard-metrics"
import { formatNpr, paisaToNpr } from "@/lib/money"

export type CardWidth = "sm" | "md" | "lg" | "xl"

export interface CardDef {
  id: string
  title: string
  subtitle?: string
  defaultWidth: CardWidth
  viewAll?: React.ReactNode
  render: (d: DashboardData) => React.ReactNode
}

function ViewAll({
  to,
  search,
}: {
  to: string
  search?: Record<string, unknown>
}) {
  return (
    <Link
      to={to as never}
      search={search as never}
      className={buttonVariants({
        variant: "ghost",
        size: "sm",
        className: "h-7 shrink-0 px-2 text-xs",
      })}
    >
      View all
    </Link>
  )
}

function Stat({
  icon,
  value,
  label,
  delta,
  tone = "default",
}: {
  icon: React.ReactNode
  value: string
  label: string
  delta?: string
  tone?: "default" | "positive" | "negative" | "warning"
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "negative"
        ? "text-destructive"
        : tone === "warning"
          ? "text-amber-600 dark:text-amber-400"
          : "text-foreground"

  return (
    <div className="flex h-full flex-col justify-between gap-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="rounded-md bg-muted p-1.5 text-primary">{icon}</span>
        <span className="text-xs font-medium uppercase tracking-[0.14em]">{label}</span>
      </div>
      <div>
        <div className={`text-3xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
        {delta ? <p className="mt-1 text-xs text-muted-foreground">{delta}</p> : null}
      </div>
    </div>
  )
}

function Row({
  primary,
  secondary,
  value,
  valueTone = "default",
  meta,
  to,
  params,
}: {
  primary: string
  secondary?: string
  value?: string
  valueTone?: "default" | "positive" | "negative" | "warning"
  meta?: React.ReactNode
  to?: "/projects/$id" | "/stand-ups/$id"
  params?: { id: string }
}) {
  const toneClass =
    valueTone === "positive"
      ? "text-emerald-600 dark:text-emerald-400"
      : valueTone === "negative"
        ? "text-destructive"
        : valueTone === "warning"
          ? "text-amber-600 dark:text-amber-400"
          : "text-foreground"

  const content = (
    <>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{primary}</p>
        {secondary ? (
          <p className="truncate text-xs text-muted-foreground">{secondary}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {meta}
        {value ? (
          <span className={`text-sm font-semibold tabular-nums ${toneClass}`}>{value}</span>
        ) : null}
      </div>
    </>
  )

  return (
    <li className="border-b border-border/60 py-2 last:border-0">
      {to && params ? (
        <Link
          to={to}
          params={params}
          className="flex items-center justify-between gap-3 hover:opacity-80"
        >
          {content}
        </Link>
      ) : (
        <div className="flex items-center justify-between gap-3">{content}</div>
      )}
    </li>
  )
}

const List = ({ children }: { children: React.ReactNode }) => (
  <ul className="-my-2 max-h-72 overflow-y-auto pr-1">{children}</ul>
)

const trendChartConfig = {
  revenue: { label: "Revenue", color: "var(--chart-2)" },
  profit: { label: "Profit", color: "var(--chart-1)" },
} satisfies ChartConfig

const groupChartConfig = {
  count: { label: "Employees", color: "var(--chart-2)" },
} satisfies ChartConfig

const allCardDefs: CardDef[] = [
  {
    id: "profit",
    title: "Total profit / loss",
    defaultWidth: "sm",
    render: (d) => (
      <Stat
        icon={<IconWallet className="size-4" />}
        label="Net Realized P&L"
        value={formatNpr(d.netProfitPaisa, { signed: true })}
        tone={paisaToNpr(d.netProfitPaisa) >= 0 ? "positive" : "negative"}
        delta={`${formatNpr(d.totalRevenuePaisa)} realized${
          d.contractedNetProfitPaisa
            ? ` · Contracted: ${formatNpr(d.contractedNetProfitPaisa, { signed: true })}`
            : " revenue in range"
        }`}
      />
    ),
  },
  {
    id: "margin",
    title: "Overall profit margin",
    defaultWidth: "sm",
    render: (d) => (
      <div className="flex h-full flex-col justify-between gap-4">
        <Stat
          icon={<IconPercentage className="size-4" />}
          label="Realized Margin"
          value={`${d.marginPct.toFixed(1)}%`}
          delta={
            d.contractedMarginPct !== undefined
              ? `Contracted: ${d.contractedMarginPct.toFixed(1)}%`
              : undefined
          }
          tone={
            d.marginPct >= (d.settings?.healthHealthyMinPercent ?? 20)
              ? "positive"
              : d.marginPct >= (d.settings?.healthAtRiskMinPercent ?? 0)
                ? "warning"
                : "negative"
          }
        />
        <Progress value={Math.max(0, Math.min(100, d.marginPct))} className="h-1.5" />
      </div>
    ),
  },
  {
    id: "active",
    title: "Active clients & projects",
    defaultWidth: "sm",
    render: (d) => (
      <div className="grid h-full grid-cols-2 gap-4">
        <Stat
          icon={<IconUsers className="size-4" />}
          label="Clients"
          value={String(d.activeClients)}
          delta={`${d.clientsWithActiveProjects} with active projects (${
            d.activeClients > 0
              ? Math.round((d.clientsWithActiveProjects / d.activeClients) * 100)
              : 0
          }%)`}
        />
        <Stat
          icon={<IconTrendingUp className="size-4" />}
          label="Projects"
          value={String(d.activeProjects)}
          delta={`${d.atRiskProjects.length} over budget`}
        />
      </div>
    ),
  },
  {
    id: "closed",
    title: "Closed projects",
    defaultWidth: "sm",
    render: (d) => (
      <Stat
        icon={<IconCheck className="size-4" />}
        label="Closed"
        value={String(d.closedProjects)}
        delta={`${d.closedFreeAmc} free AMC · ${d.closedPaidAmc} paid AMC`}
      />
    ),
  },
  {
    id: "vat",
    title: "Unpaid accrued VAT",
    defaultWidth: "sm",
    render: (d) => (
      <Stat
        icon={<IconReceipt className="size-4" />}
        label="VAT payable"
        value={formatNpr(d.unpaidVatPaisa)}
        tone="warning"
        delta="Outstanding balance"
      />
    ),
  },
  {
    id: "amc-value",
    title: "Total AMC value",
    defaultWidth: "sm",
    render: (d) => (
      <Stat
        icon={<IconShieldCheck className="size-4" />}
        label="AMC book"
        value={formatNpr(d.amcValuePaisa)}
        tone="positive"
        delta={`${d.activeAmcs} active contracts`}
      />
    ),
  },
  {
    id: "standup-count",
    title: "Total stand-ups",
    defaultWidth: "sm",
    render: (d) => (
      <Stat
        icon={<IconMessages className="size-4" />}
        label="Stand-ups"
        value={String(d.totalStandups)}
        delta="Completed in selected range"
      />
    ),
  },
  {
    id: "headcount",
    title: "Total employees",
    defaultWidth: "sm",
    render: (d) => (
      <Stat
        icon={<IconUsers className="size-4" />}
        label="Headcount"
        value={String(d.totalEmployees)}
        delta={`${d.groupCounts.length} groups`}
      />
    ),
  },
  {
    id: "trend",
    title: "Profit trend",
    subtitle: "Revenue vs. profit across the selected range",
    defaultWidth: "lg",
    render: (d) =>
      d.trend.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No trend data for this range.
        </p>
      ) : (
        <ChartContainer config={trendChartConfig} className="aspect-auto h-56 w-full">
          <AreaChart data={d.trend} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => formatNpr(Math.round(Number(value) * 100))}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="var(--color-revenue)"
              fill="var(--color-revenue)"
              fillOpacity={0.2}
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="profit"
              stroke="var(--color-profit)"
              fill="var(--color-profit)"
              fillOpacity={0.2}
              strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>
      ),
  },
  {
    id: "top-projects",
    title: "Top 5 profitable projects",
    defaultWidth: "md",
    render: (d) => (
      <List>
        {d.topProjects.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No profitable projects.</p>
        ) : (
          d.topProjects.map((p) => (
            <Row
              key={p.id}
              to="/projects/$id"
              params={{ id: p.id }}
              primary={p.name}
              secondary={`${p.client} · ${p.marginPercent.toFixed(0)}% realized${
                p.contractedProfitLossPaisa
                  ? ` (Contracted: ${formatNpr(p.contractedProfitLossPaisa, { signed: true })})`
                  : ""
              }`}
              value={formatNpr(p.profitLossPaisa, { signed: true })}
              valueTone="positive"
              meta={<IconArrowUpRight className="size-4 text-emerald-600 dark:text-emerald-400" />}
            />
          ))
        )}
      </List>
    ),
  },
  {
    id: "worst-projects",
    title: "Least 5 profitable projects",
    defaultWidth: "md",
    render: (d) => (
      <List>
        {d.worstProjects.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No loss-making projects.</p>
        ) : (
          d.worstProjects.map((p) => (
            <Row
              key={p.id}
              to="/projects/$id"
              params={{ id: p.id }}
              primary={p.name}
              secondary={`${p.client} · ${p.marginPercent.toFixed(0)}% realized${
                p.contractedProfitLossPaisa
                  ? ` (Contracted: ${formatNpr(p.contractedProfitLossPaisa, { signed: true })})`
                  : ""
              }`}
              value={formatNpr(p.profitLossPaisa, { signed: true })}
              valueTone={paisaToNpr(p.profitLossPaisa) < 0 ? "negative" : "warning"}
              meta={<IconArrowDownRight className="size-4 text-destructive" />}
            />
          ))
        )}
      </List>
    ),
  },
  {
    id: "at-risk",
    title: "Projects trending over budget",
    subtitle: "Labor burn exceeding budget trajectory",
    defaultWidth: "md",
    render: (d) => (
      <List>
        {d.atRiskProjects.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nothing at risk.</p>
        ) : (
          d.atRiskProjects.map((p) => (
            <Row
              key={p.id}
              to="/projects/$id"
              params={{ id: p.id }}
              primary={p.name}
              secondary={p.client}
              value={`${p.marginPercent.toFixed(0)}% margin`}
              valueTone="negative"
              meta={
                <HealthBadge marginPercent={p.marginPercent} settings={d.settings} />
              }
            />
          ))
        )}
      </List>
    ),
  },
  {
    id: "categories",
    title: "Category breakdown",
    defaultWidth: "md",
    viewAll: <ViewAll to="/categories" />,
    render: (d) => (
      <List>
        {d.categoryBreakdown.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No categories.</p>
        ) : (
          d.categoryBreakdown.map((c) => (
            <Row
              key={c.categoryId}
              primary={c.categoryName}
              value={formatNpr(c.profitLossPaisa, { signed: true })}
              valueTone={
                paisaToNpr(c.profitLossPaisa) >= 0 ? "positive" : "negative"
              }
            />
          ))
        )}
      </List>
    ),
  },
  {
    id: "amc-followups",
    title: "AMCs needing follow-up",
    defaultWidth: "md",
    viewAll: <ViewAll to="/amc" search={{ tab: "attention" }} />,
    render: (d) => (
      <List>
        {d.amcFollowUps.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No follow-ups due.</p>
        ) : (
          d.amcFollowUps.map((a) => (
            <Row
              key={a.id}
              to="/projects/$id"
              params={{ id: a.projectId }}
              primary={a.client}
              secondary={`${a.name} · ends ${format(parseISO(a.endDate.slice(0, 10)), "d MMM yyyy")}`}
              value={a.valuePaisa ? formatNpr(a.valuePaisa) : "—"}
              valueTone="warning"
              meta={<IconCalendarClock className="size-4 text-amber-600 dark:text-amber-400" />}
            />
          ))
        )}
      </List>
    ),
  },
  {
    id: "amcs",
    title: "AMC contracts",
    subtitle: "All maintenance contracts by value",
    defaultWidth: "md",
    viewAll: <ViewAll to="/amc" search={{ tab: "all" }} />,
    render: (d) => (
      <List>
        {d.amcList.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No AMC contracts.</p>
        ) : (
          d.amcList.map((a) => (
            <Row
              key={a.id}
              to="/projects/$id"
              params={{ id: a.projectId }}
              primary={a.client}
              secondary={`${a.name} · renews ${format(parseISO(a.endDate.slice(0, 10)), "d MMM yyyy")}`}
              value={a.valuePaisa ? formatNpr(a.valuePaisa) : "—"}
              meta={<StatusBadge status={a.status} />}
            />
          ))
        )}
      </List>
    ),
  },
  {
    id: "standups",
    title: "Recent stand-ups",
    defaultWidth: "md",
    viewAll: (
      <ViewAll
        to="/stand-ups"
        search={{ page: 1, pageSize: 25, view: "list", q: "", employeeId: "" }}
      />
    ),
    render: (d) => (
      <List>
        {d.recentStandups.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No stand-ups yet.</p>
        ) : (
          d.recentStandups.map((s) => (
            <Row
              key={s.id}
              to="/stand-ups/$id"
              params={{ id: s.id }}
              primary={`${s.author} · ${s.group}`}
              secondary={s.summary}
              value={format(parseISO(s.at.slice(0, 10)), "d MMM yyyy")}
              meta={<IconMessages className="size-4 text-muted-foreground" />}
            />
          ))
        )}
      </List>
    ),
  },
  {
    id: "groups",
    title: "Employees per group",
    defaultWidth: "md",
    viewAll: <ViewAll to="/employee-groups" search={{ page: 1, pageSize: 25 }} />,
    render: (d) =>
      d.groupCounts.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No employee groups.</p>
      ) : (
        <ChartContainer config={groupChartConfig} className="aspect-auto h-56 w-full">
          <BarChart data={d.groupCounts} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="group"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="count" fill="var(--color-count)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ChartContainer>
      ),
  },
  {
    id: "audit",
    title: "Recent audit logs",
    defaultWidth: "md",
    viewAll: <ViewAll to="/audit" search={{ page: 1, pageSize: 25 }} />,
    render: (d) => (
      <List>
        {d.recentAudit.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No audit entries.</p>
        ) : (
          d.recentAudit.map((l) => (
            <Row
              key={l.id}
              primary={`${l.actor} · ${l.action}`}
              secondary={l.target}
              value={relativeTime(l.at)}
              meta={<IconFileText className="size-4 text-muted-foreground" />}
            />
          ))
        )}
      </List>
    ),
  },
]

export function getCardDefs(canViewAudit: boolean): CardDef[] {
  return allCardDefs.filter((card) => card.id !== "audit" || canViewAudit)
}

export const cardDefs = allCardDefs
