import * as React from "react"
import { IconPlus, IconTrash } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { useConfirmDialog } from "@/components/confirm-dialog"
import { WriteOffDialog } from "@/components/write-offs/write-off-dialog"
import { api, ApiError } from "@/lib/api"
import type { Envelope } from "@/lib/api"
import { toDateKey } from "@/lib/dates"
import { formatNpr } from "@/lib/money"
import type { WriteOffRecord } from "@/lib/types"

export function ProjectWriteOffsPanel({
  projectId,
  maxAmountPaisa,
  canMutate,
  onChanged,
}: {
  projectId: string
  maxAmountPaisa?: string | number
  canMutate: boolean
  onChanged?: () => void
}) {
  const { confirm, dialog } = useConfirmDialog()
  const [rows, setRows] = React.useState<WriteOffRecord[]>([])
  const [loading, setLoading] = React.useState(true)
  const [open, setOpen] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await api<Envelope<WriteOffRecord[]>>(
        `/write-offs?projectId=${encodeURIComponent(projectId)}`,
      )
      setRows(res.data)
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [projectId])

  React.useEffect(() => {
    void load()
  }, [load])

  const written = rows.reduce((sum, row) => sum + Number(row.amountPaisa), 0)
  const remaining = Math.max(0, Number(maxAmountPaisa ?? 0) - written)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Write-offs</CardTitle>
        {canMutate ? (
          <Button
            size="sm"
            variant="outline"
            disabled={remaining <= 0}
            onClick={() => setOpen(true)}
          >
            <IconPlus className="size-3.5" />
            Write off
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No write-offs yet.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex items-start justify-between gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <div className="font-medium tabular-nums">
                    {formatNpr(row.amountPaisa)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {toDateKey(row.date)}
                    {row.notes ? ` · ${row.notes}` : ""}
                  </div>
                </div>
                {canMutate ? (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    aria-label="Delete write-off"
                    onClick={() => {
                      void (async () => {
                        const ok = await confirm({
                          title: "Delete write-off?",
                          description:
                            "This restores the amount to contracted / AMC value.",
                          confirmLabel: "Delete",
                          destructive: true,
                        })
                        if (!ok) return
                        try {
                          await api(`/write-offs/${row.id}`, {
                            method: "DELETE",
                          })
                          await load()
                          onChanged?.()
                        } catch (e) {
                          alert(
                            e instanceof ApiError
                              ? e.message
                              : "Failed to delete write-off",
                          )
                        }
                      })()
                    }}
                  >
                    <IconTrash className="size-3.5" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          Written off {formatNpr(String(written))}
          {maxAmountPaisa !== undefined
            ? ` · remaining ${formatNpr(String(remaining))}`
            : ""}
        </p>
      </CardContent>
      <WriteOffDialog
        open={open}
        onOpenChange={setOpen}
        projectId={projectId}
        maxAmountPaisa={remaining}
        onCreated={() => {
          void load()
          onChanged?.()
        }}
      />
      {dialog}
    </Card>
  )
}
