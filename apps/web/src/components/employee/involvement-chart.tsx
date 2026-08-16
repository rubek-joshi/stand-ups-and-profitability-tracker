import * as React from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  XAxis,
  YAxis,
} from "recharts"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@workspace/ui/components/chart"

export type InvolvementEntry = {
  date: string
  projectId: string
  projectName: string
  percentage: number
}

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const

function colorFor(_projectId: string, index: number) {
  return CHART_COLORS[index % CHART_COLORS.length] ?? CHART_COLORS[0]
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-[280px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
      {message}
    </div>
  )
}

export function ProjectAllocationChart({ entries }: { entries: InvolvementEntry[] }) {
  const data = React.useMemo(() => {
    const totals = new Map<string, { project: string; projectId: string; percentage: number }>()
    for (const e of entries) {
      const prev = totals.get(e.projectId)
      totals.set(e.projectId, {
        projectId: e.projectId,
        project: e.projectName,
        percentage: (prev?.percentage ?? 0) + e.percentage,
      })
    }
    return [...totals.values()]
      .filter((d) => d.percentage > 0)
      .sort((a, b) => b.percentage - a.percentage)
  }, [entries])

  const config = React.useMemo(() => {
    const next: ChartConfig = {}
    for (const [i, row] of data.entries()) {
      next[row.projectId] = {
        label: row.project,
        color: colorFor(row.projectId, i),
      }
    }
    return next
  }, [data])

  if (!data.length) {
    return <EmptyChart message="No project allocations in this range." />
  }

  return (
    <ChartContainer config={config} className="aspect-auto h-[280px] w-full">
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
        <CartesianGrid horizontal={false} />
        <XAxis
          type="number"
          tickLine={false}
          axisLine={false}
          unit="%"
          tick={{ fontSize: 11 }}
        />
        <YAxis
          type="category"
          dataKey="project"
          width={120}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11 }}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value: number | string) => [`${String(value)}%`, "Allocated"]}
              hideLabel
            />
          }
        />
        <Bar dataKey="percentage" radius={[0, 6, 6, 0]} barSize={22}>
          {data.map((d, i) => (
            <Cell key={d.projectId} fill={colorFor(d.projectId, i)} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

export function ProjectTimelineChart({
  entries,
  bucket,
}: {
  entries: InvolvementEntry[]
  bucket: "day" | "week" | "month"
}) {
  const { data, keys, config } = React.useMemo(() => {
    const byBucket = new Map<string, Record<string, number | string>>()
    const used = new Map<string, string>()
    for (const e of entries) {
      const d = new Date(`${e.date.slice(0, 10)}T00:00:00Z`)
      let label = e.date.slice(5, 10)
      if (bucket === "month") {
        label = d.toLocaleDateString("en-US", {
          month: "short",
          year: "2-digit",
          timeZone: "UTC",
        })
      } else if (bucket === "week") {
        const monday = new Date(d)
        monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7))
        label = `wk ${monday.toISOString().slice(5, 10)}`
      }
      const row = byBucket.get(label) ?? { label }
      row[e.projectId] = Number(row[e.projectId] ?? 0) + e.percentage
      byBucket.set(label, row)
      used.set(e.projectId, e.projectName)
    }
    const orderedKeys = [...used.entries()].map(([id]) => id)
    const chartConfig: ChartConfig = {}
    orderedKeys.forEach((id, i) => {
      chartConfig[id] = {
        label: used.get(id) ?? id,
        color: colorFor(id, i),
      }
    })
    return {
      data: [...byBucket.values()],
      keys: orderedKeys,
      config: chartConfig,
    }
  }, [entries, bucket])

  if (!data.length) {
    return <EmptyChart message="No project allocations in this range." />
  }

  return (
    <ChartContainer config={config} className="aspect-auto h-[280px] w-full">
      <BarChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 10 }}
          interval="preserveStartEnd"
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          unit="%"
          tick={{ fontSize: 11 }}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        {keys.map((key, i) => (
          <Bar
            key={key}
            dataKey={key}
            stackId="pct"
            fill={colorFor(key, i)}
            radius={i === keys.length - 1 ? [4, 4, 0, 0] : 0}
          />
        ))}
      </BarChart>
    </ChartContainer>
  )
}

export function projectColor(projectId: string, index: number) {
  return colorFor(projectId, index)
}
