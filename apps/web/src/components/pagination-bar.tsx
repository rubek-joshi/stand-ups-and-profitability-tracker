import * as React from "react"
import { Button } from "@workspace/ui/components/button"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
} from "@workspace/ui/components/pagination"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react"
import {
  clampPage,
  PAGE_SIZES,
  type PageSize,
} from "@/lib/list-query"

type PageToken =
  | { kind: "page"; value: number }
  | { kind: "ellipsis"; key: string }

function buildPageTokens(page: number, totalPages: number): PageToken[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => ({
      kind: "page" as const,
      value: i + 1,
    }))
  }

  const tokens: PageToken[] = []
  const current = clampPage(page, totalPages)
  const addPage = (p: number) => tokens.push({ kind: "page", value: p })
  const addEllipsis = (key: string) => tokens.push({ kind: "ellipsis", key })

  addPage(1)
  const left = Math.max(2, current - 1)
  const right = Math.min(totalPages - 1, current + 1)
  if (left > 2) addEllipsis("left")
  for (let p = left; p <= right; p++) addPage(p)
  if (right < totalPages - 1) addEllipsis("right")
  addPage(totalPages)
  return tokens
}

export function PaginationBar({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  onPageSizeChange,
  summary,
}: {
  page: number
  totalPages: number
  total?: number
  pageSize: PageSize
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: PageSize) => void
  summary?: (args: {
    page: number
    totalPages: number
    total?: number
    pageSize: PageSize
  }) => React.ReactNode
}) {
  const safeTotalPages = Math.max(1, totalPages)
  const current = clampPage(page, safeTotalPages)
  const tokens = React.useMemo(
    () => buildPageTokens(current, safeTotalPages),
    [current, safeTotalPages],
  )

  const summaryText =
    summary?.({
      page: current,
      totalPages: safeTotalPages,
      total,
      pageSize,
    }) ??
    (typeof total === "number"
      ? (() => {
          if (total === 0) return "Showing 0-0 of 0 results"
          const start = (current - 1) * pageSize + 1
          const end = Math.min(total, start + pageSize - 1)
          return `Showing ${start}-${end} of ${total} results`
        })()
      : `Page ${current} of ${safeTotalPages}`)

  return (
    <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">{summaryText}</p>

      <div className="flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-center sm:gap-2">
        <div className="flex items-center justify-between gap-2 sm:justify-start">
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            Rows per page
          </span>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => {
              const next = Number(value)
              if (next === 10 || next === 25 || next === 50 || next === 100) {
                onPageSizeChange(next)
              }
            }}
            items={Object.fromEntries(PAGE_SIZES.map((size) => [String(size), String(size)]))}
          >
            <SelectTrigger className="min-w-16" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Pagination className="mx-0 w-full justify-between sm:w-auto sm:justify-end">
          <PaginationContent className="w-full justify-between sm:w-auto sm:justify-start">
            <PaginationItem>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 pl-2"
                disabled={current <= 1}
                onClick={() => onPageChange(Math.max(1, current - 1))}
              >
                <IconChevronLeft className="size-4" />
                <span className="hidden sm:inline">Prev</span>
              </Button>
            </PaginationItem>

            <PaginationItem className="sm:hidden">
              <span className="whitespace-nowrap px-2 text-sm text-muted-foreground">
                Page {current} of {safeTotalPages}
              </span>
            </PaginationItem>

            {tokens.map((token) =>
              token.kind === "ellipsis" ? (
                <PaginationItem key={token.key} className="hidden sm:block">
                  <PaginationEllipsis />
                </PaginationItem>
              ) : (
                <PaginationItem key={token.value} className="hidden sm:block">
                  <Button
                    variant={token.value === current ? "outline" : "ghost"}
                    size="icon"
                    className="size-8"
                    onClick={() => onPageChange(token.value)}
                  >
                    {token.value}
                  </Button>
                </PaginationItem>
              ),
            )}

            <PaginationItem>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 pr-2"
                disabled={current >= safeTotalPages}
                onClick={() => onPageChange(Math.min(safeTotalPages, current + 1))}
              >
                <span className="hidden sm:inline">Next</span>
                <IconChevronRight className="size-4" />
              </Button>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  )
}
