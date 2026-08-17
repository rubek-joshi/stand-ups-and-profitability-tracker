import type { ReactNode } from "react"
import {
  PageBreadcrumbs,
  type BreadcrumbEntry,
} from "@/components/page-breadcrumbs"

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
}: {
  title: string
  description?: string
  actions?: ReactNode
  breadcrumbs?: BreadcrumbEntry[]
}) {
  return (
    <div className="mb-6">
      {breadcrumbs?.length ? (
        <PageBreadcrumbs items={breadcrumbs} className="mb-3" />
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  )
}
