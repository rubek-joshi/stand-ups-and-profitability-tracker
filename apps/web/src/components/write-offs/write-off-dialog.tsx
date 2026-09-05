import * as React from "react"
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
import { Textarea } from "@workspace/ui/components/textarea"
import { DateInput } from "@/components/datetime-picker"
import { api, ApiError } from "@/lib/api"
import type { Envelope } from "@/lib/api"
import { dateStringParser, isDateValid } from "@/lib/date-input"
import { formatNpr, parseNprInput, paisaToNpr } from "@/lib/money"
import { nptTodayIso } from "@/lib/standup-age"
import type { WriteOffRecord } from "@/lib/types"

export function WriteOffDialog({
  open,
  onOpenChange,
  projectId,
  amcId,
  maxAmountPaisa,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId?: string
  amcId?: string
  maxAmountPaisa?: string | number
  onCreated?: (created: WriteOffRecord) => void
}) {
  const [date, setDate] = React.useState(nptTodayIso)
  const [amount, setAmount] = React.useState("")
  const [notes, setNotes] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    setDate(nptTodayIso())
    setAmount("")
    setNotes("")
    setError(null)
  }, [open])

  const maxNpr =
    maxAmountPaisa !== undefined && maxAmountPaisa !== null
      ? paisaToNpr(maxAmountPaisa)
      : null

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    if (Boolean(projectId) === Boolean(amcId)) {
      setError("Write-off must target a project or an AMC")
      return
    }
    const parsedDate = dateStringParser(date)
    if (
      !parsedDate ||
      !isDateValid({ date: parsedDate, maxDate: nptTodayIso() })
    ) {
      setError("Enter a valid date")
      return
    }
    let parsed: number
    try {
      parsed = parseNprInput(amount)
    } catch {
      setError("Enter a valid amount")
      return
    }
    if (parsed <= 0) {
      setError("Amount must be greater than zero")
      return
    }
    if (maxNpr !== null && parsed > maxNpr) {
      setError(`Amount cannot exceed ${formatNpr(maxAmountPaisa ?? 0)}`)
      return
    }
    setSaving(true)
    try {
      const res = await api<Envelope<WriteOffRecord>>("/write-offs", {
        method: "POST",
        body: {
          ...(projectId ? { projectId } : { amcId }),
          date: parsedDate,
          amountNpr: parsed,
          notes: notes.trim() || undefined,
        },
      })
      onCreated?.(res.data)
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create write-off")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Write off / bad debt</DialogTitle>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="write-off-date">Date</Label>
            <DateInput
              id="write-off-date"
              value={date}
              onChange={(next) => setDate(next ?? "")}
              max={nptTodayIso()}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="write-off-amount">Amount (NPR)</Label>
            <Input
              id="write-off-amount"
              inputMode="decimal"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            {maxNpr !== null ? (
              <p className="text-xs text-muted-foreground">
                Remaining writable: {formatNpr(maxAmountPaisa ?? 0)}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="write-off-notes">Notes (optional)</Label>
            <Textarea
              id="write-off-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Write off"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
