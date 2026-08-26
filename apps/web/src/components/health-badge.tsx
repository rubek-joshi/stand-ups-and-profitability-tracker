import { Badge } from "@workspace/ui/components/badge"
import type { OrgSettings } from "@/lib/types"

export function healthFromMargin(
  marginPercent: number,
  settings?: Pick<OrgSettings, "healthHealthyMinPercent" | "healthAtRiskMinPercent"> | null,
): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } {
  const healthy = settings?.healthHealthyMinPercent ?? 20
  const atRisk = settings?.healthAtRiskMinPercent ?? 0
  if (marginPercent >= healthy) return { label: "Healthy", variant: "default" }
  if (marginPercent >= atRisk) return { label: "At Risk", variant: "secondary" }
  return { label: "Bleeding", variant: "destructive" }
}

export function HealthBadge({
  marginPercent,
  settings,
}: {
  marginPercent: number
  settings?: Pick<OrgSettings, "healthHealthyMinPercent" | "healthAtRiskMinPercent"> | null
}) {
  const h = healthFromMargin(marginPercent, settings)
  return <Badge variant={h.variant}>{h.label}</Badge>
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    active: "default",
    extended: "secondary",
    closed: "outline",
    under_amc: "secondary",
    inactive: "outline",
    left: "outline",
    draft: "outline",
    in_progress: "secondary",
    completed: "default",
    paid: "default",
    pending: "secondary",
    overdue: "destructive",
    reminder_due: "secondary",
    free_period: "default",
    paid_pending: "secondary",
    cancelled: "outline",
  }
  const labels: Record<string, string> = {
    under_amc: "Under AMC",
  }
  const label = labels[status] ?? status.replaceAll("_", " ")
  return (
    <Badge variant={map[status] ?? "outline"} className={labels[status] ? undefined : "capitalize"}>
      {label}
    </Badge>
  )
}
