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
import { Label } from "@workspace/ui/components/label"
import { DateInput } from "@/components/datetime-picker"
import { dateStringParser, isDateValid } from "@/lib/date-input"
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
  const [dateError, setDateError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (invoice) {
      setDate(nptTodayIso())
      setBusy(false)
      setDateError(null)
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
          <DateInput
            id="payment-date"
            value={date}
            min={invoiceDay || undefined}
            max={nptTodayIso()}
            disabled={busy}
            onChange={(next) => {
              setDateError(null)
              if (next) setDate(next)
            }}
          />
          {dateError ? (
            <p className="text-xs text-destructive" role="alert">
              {dateError}
            </p>
          ) : null}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy || !date}
            onClick={async (event) => {
              event.preventDefault()
              const parsed = dateStringParser(date)
              if (
                !parsed ||
                !isDateValid({
                  date: parsed,
                  minDate: invoiceDay || undefined,
                  maxDate: nptTodayIso(),
                })
              ) {
                setDateError("Enter a valid payment date")
                return
              }
              setBusy(true)
              try {
                await onConfirm(parsed)
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
