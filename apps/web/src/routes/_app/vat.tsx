import * as React from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
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
import { useConfirmDialog } from "@/components/confirm-dialog"
import { ErrorState, LoadingState } from "@/components/ui-states"
import { api, ApiError, type Envelope } from "@/lib/api"
import { formatNpr } from "@/lib/money"
import type { VatAccumulated, VatClearance } from "@/lib/types"

export const Route = createFileRoute("/_app/vat")({
  component: VatPage,
})

function VatPage() {
  const { confirm, dialog } = useConfirmDialog()
  const [acc, setAcc] = React.useState<VatAccumulated | null>(null)
  const [history, setHistory] = React.useState<VatClearance[]>([])
  const [note, setNote] = React.useState("")
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [a, h] = await Promise.all([
        api<Envelope<VatAccumulated>>("/vat/accumulated"),
        api<Envelope<VatClearance[]>>("/vat/clearances"),
      ])
      setAcc(a.data)
      setHistory(h.data)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load VAT")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  if (loading) return <LoadingState />
  if (error) return <ErrorState message={error} onRetry={load} />

  return (
    <div>
      <PageHeader title="VAT" description="Accumulated liability and clearances" />
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Accrued</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold tabular-nums">
            {formatNpr(acc?.accruedPaisa)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Cleared</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold tabular-nums">
            {formatNpr(acc?.clearedPaisa)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Unpaid</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold tabular-nums">
            {formatNpr(acc?.unpaidPaisa)}
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Mark paid</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1 space-y-2">
            <Label>Note (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <Button
            disabled={!acc || Number(acc.unpaidPaisa) <= 0}
            onClick={async () => {
              const ok = await confirm({
                title: "Clear unpaid VAT?",
                description: `This clears ${formatNpr(acc?.unpaidPaisa)} as paid.`,
                confirmLabel: "Mark paid",
                destructive: true,
              })
              if (!ok) return
              await api("/vat/mark-paid", { method: "POST", body: { note: note || undefined } })
              setNote("")
              await load()
            }}
          >
            Mark paid
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Clearance history</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>By</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((h) => (
                <TableRow key={h.id}>
                  <TableCell>{String(h.createdAt).slice(0, 10)}</TableCell>
                  <TableCell>{formatNpr(h.amountPaisa)}</TableCell>
                  <TableCell>{h.clearedBy?.name ?? "—"}</TableCell>
                  <TableCell>{h.note || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {dialog}
    </div>
  )
}
