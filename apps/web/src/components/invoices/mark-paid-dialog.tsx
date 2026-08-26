import * as React from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { formatNpr } from "@/lib/money"
import { nptTodayIso } from "@/lib/standup-age"
import type { Invoice } from "@/lib/types"

export function MarkPaidDialog({
  invoice,
  onClose,
  onConfirm,
}: {
  invoice: Invoice | null
  onClose: () => void
  onConfirm: (paymentDate: string) => void | Promise<void>
}) {
  const [date, setDate] = React.useState(nptTodayIso)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (invoice) {
      setDate(nptTodayIso())
      setBusy(false)
    }
  }, [invoice])

  const invoiceDay = invoice ? String(invoice.invoiceDate).slice(0, 10) : ""

  return (
    <AlertDialog
      open={Boolean(invoice)}
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Mark invoice as paid?</AlertDialogTitle>
          <AlertDialogDescription>
            Invoice {invoice?.invoiceNumber} for {formatNpr(invoice?.totalPaisa)}.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-2 py-2">
          <Label htmlFor="payment-date">Payment date</Label>
          <Input
            id="payment-date"
            type="date"
            required
            min={invoiceDay}
            max={nptTodayIso()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={busy}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy || !date}
            onClick={async (event) => {
              event.preventDefault()
              setBusy(true)
              try {
                await onConfirm(date)
                onClose()
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy ? "Saving…" : "Mark paid"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
