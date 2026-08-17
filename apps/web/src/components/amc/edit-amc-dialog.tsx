import * as React from "react"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"
import { api, ApiError, type Envelope } from "@/lib/api"
import { amcEnd, amcStart } from "@/lib/amc"
import { paisaToNpr, parseNprInput } from "@/lib/money"
import type { AmcRecord, AmcType } from "@/lib/types"

export function EditAmcDialog({
  amc,
  open,
  onOpenChange,
  onUpdated,
}: {
  amc: AmcRecord | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdated?: (amc: AmcRecord) => void
}) {
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [type, setType] = React.useState<AmcType>("complimentary")
  const [startDate, setStartDate] = React.useState("")
  const [endDate, setEndDate] = React.useState("")
  const [value, setValue] = React.useState("")
  const [notes, setNotes] = React.useState("")
  const [isVatApplicable, setIsVatApplicable] = React.useState(true)

  React.useEffect(() => {
    if (!open || !amc) return
    setError(null)
    setType(amc.type)
    setStartDate(amcStart(amc))
    setEndDate(amcEnd(amc))
    setValue(
      amc.amcAmountPaisa != null && amc.amcAmountPaisa !== ""
        ? String(paisaToNpr(amc.amcAmountPaisa))
        : "",
    )
    setNotes(amc.notes ?? "")
    setIsVatApplicable(amc.isVatApplicable ?? true)
  }, [open, amc])

  if (!amc) return null

  const projectLabel = [amc.projectName, amc.clientName].filter(Boolean).join(" · ")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit AMC</DialogTitle>
          <DialogDescription>
            Update dates, type, and contract details
            {projectLabel ? ` for ${projectLabel}` : ""}.
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4 py-2"
          onSubmit={async (e) => {
            e.preventDefault()
            if (endDate < startDate) {
              setError("End date must be on or after start date")
              return
            }
            setSaving(true)
            setError(null)
            try {
              const res = await api<Envelope<AmcRecord>>(`/amc/${amc.id}`, {
                method: "PATCH",
                body: {
                  type,
                  startDate,
                  endDate,
                  notes: notes.trim() || undefined,
                  isVatApplicable,
                  amcAmountNpr:
                    type === "paid"
                      ? parseNprInput(value || "0")
                      : undefined,
                },
              })
              onUpdated?.(res.data)
              onOpenChange(false)
            } catch (err) {
              setError(err instanceof ApiError ? err.message : "Failed to update AMC")
            } finally {
              setSaving(false)
            }
          }}
        >
          <div className="grid gap-2">
            <Label>Type</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["complimentary", "paid"] as AmcType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`rounded-lg border px-3 py-2.5 text-sm font-medium capitalize transition-colors ${
                    type === t
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-amc-start">Start date</Label>
              <Input
                id="edit-amc-start"
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-amc-end">End date</Label>
              <Input
                id="edit-amc-end"
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          {type === "paid" ? (
            <div className="grid gap-2">
              <Label htmlFor="edit-amc-value">Contract value (NPR)</Label>
              <Input
                id="edit-amc-value"
                required
                placeholder="180000"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
          ) : null}

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={isVatApplicable}
              onCheckedChange={(v) => setIsVatApplicable(Boolean(v))}
            />
            VAT applicable
          </label>

          <div className="grid gap-2">
            <Label htmlFor="edit-amc-notes">Notes</Label>
            <Textarea
              id="edit-amc-notes"
              rows={2}
              placeholder="Scope, SLA, billing cadence…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
