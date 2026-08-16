import * as React from "react"
import { Link, createFileRoute } from "@tanstack/react-router"
import { IconEye } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { PageHeader } from "@/components/page-header"
import { PaginationBar } from "@/components/pagination-bar"
import { StatusBadge } from "@/components/health-badge"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui-states"
import {
  TableActionLink,
  TableActionsCell,
  TableActionsHead,
} from "@/components/table-row-actions"
import { api, ApiError, type PaginatedEnvelope } from "@/lib/api"
import { buildListQuery, parsePage, parsePageSize, totalPagesFor } from "@/lib/list-query"
import type { Standup } from "@/lib/types"
import { format, parseISO } from "date-fns"

export const Route = createFileRoute("/_app/stand-ups/")({
  validateSearch: (search: Record<string, unknown>) => ({
    page: parsePage(search.page),
    pageSize: parsePageSize(search.pageSize),
  }),
  component: StandupsPage,
})

function formatStandupDate(value: string) {
  const key = String(value).slice(0, 10)
  try {
    return format(parseISO(key), "EEE, d MMM yyyy")
  } catch {
    return key
  }
}

/** UTC calendar date as YYYY-MM-DD (matches API date parsing). */
function utcIsoDate(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

/** Yesterday UTC (stand-ups cannot be today or future). */
function maxStandupDate() {
  const d = new Date(`${utcIsoDate()}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

function StandupsPage() {
  const navigate = Route.useNavigate()
  const { page, pageSize } = Route.useSearch()
  const [items, setItems] = React.useState<Standup[]>([])
  const [total, setTotal] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState(false)
  const [date, setDate] = React.useState(maxStandupDate)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = buildListQuery({ page, pageSize })
      const res = await api<PaginatedEnvelope<Standup[]>>(`/standups?${qs}`)
      setItems(res.data)
      setTotal(res.meta?.total ?? res.data.length)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load stand-ups")
    } finally {
      setLoading(false)
    }
  }, [page, pageSize])

  React.useEffect(() => {
    void load()
  }, [load])

  const maxDate = maxStandupDate()
  const totalPages = totalPagesFor(total, pageSize)

  return (
    <div>
      <PageHeader
        title="Stand-ups"
        description="Daily allocations and attendance"
        actions={
          <Button
            onClick={() => {
              setDate(maxStandupDate())
              setOpen(true)
            }}
          >
            New stand-up
          </Button>
        }
      />
      {loading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!loading && items.length === 0 ? <EmptyState message="No stand-ups yet" /> : null}
      {items.length > 0 ? (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Entries</TableHead>
                  <TableHead>Created by</TableHead>
                  <TableActionsHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <Link
                        to="/stand-ups/$id"
                        params={{ id: s.id }}
                        className="font-medium hover:underline"
                      >
                        {formatStandupDate(String(s.date))}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={s.status} />
                    </TableCell>
                    <TableCell>{s._count?.entries ?? "—"}</TableCell>
                    <TableCell>{s.createdBy?.name ?? "—"}</TableCell>
                    <TableActionsCell>
                      <TableActionLink
                        label="Open"
                        to="/stand-ups/$id"
                        params={{ id: s.id }}
                      >
                        <IconEye className="size-3.5" />
                      </TableActionLink>
                    </TableActionsCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <PaginationBar
            page={page}
            totalPages={totalPages}
            total={total}
            pageSize={pageSize}
            onPageChange={(nextPage) => {
              void navigate({
                search: (prev) => ({ ...prev, page: nextPage }),
              })
            }}
            onPageSizeChange={(size) => {
              void navigate({
                search: (prev) => ({ ...prev, pageSize: size, page: 1 }),
              })
            }}
          />
        </div>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create stand-up</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault()
              if (date >= utcIsoDate()) {
                alert("Stand-ups can only be created for past dates.")
                return
              }
              try {
                await api("/standups", { method: "POST", body: { date } })
                setOpen(false)
                void navigate({
                  search: (prev) => ({ ...prev, page: 1 }),
                })
                await load()
              } catch (err) {
                alert(err instanceof ApiError ? err.message : "Failed")
              }
            }}
          >
            <div className="space-y-2">
              <Label>Date</Label>
              <Input
                type="date"
                required
                max={maxDate}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Past dates only — not today or future. One stand-up per day.
              </p>
            </div>
            <DialogFooter>
              <Button type="submit">Create</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
