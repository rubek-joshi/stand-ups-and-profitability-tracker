import type { ReactNode } from "react"
import {
  PageBreadcrumbs,
  type BreadcrumbEntry,
} from "@/components/page-breadcrumbs"

export function PageHeader({
  title,
  description,
  status,
  actions,
  breadcrumbs,
}: {
  title: string
  description?: string
  /** Shown directly under the title (e.g. status / health badges). */
  status?: ReactNode
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
          {status ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">{status}</div>
          ) : null}
          {description ? (
            <p
              className={`text-sm text-muted-foreground ${status ? "mt-1.5" : "mt-1"}`}
            >
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </div>
  )
}
