import * as React from "react"
import { Button } from "@workspace/ui/components/button"
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

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

export function MarkLeftDialog({
  open,
  onOpenChange,
  personName,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  personName?: string
  onConfirm: (dateLeft: string) => void | Promise<void>
}) {
  const [dateLeft, setDateLeft] = React.useState(todayIsoDate)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open) setDateLeft(todayIsoDate())
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mark as left</DialogTitle>
          <DialogDescription>
            {personName
              ? `Set the last working day for ${personName}.`
              : "Set the last working day."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-2"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!dateLeft) return
            setSaving(true)
            try {
              await onConfirm(dateLeft)
              onOpenChange(false)
            } finally {
              setSaving(false)
            }
          }}
        >
          <Label htmlFor="mark-left-date">Date left</Label>
          <Input
            id="mark-left-date"
            type="date"
            required
            value={dateLeft}
            onChange={(e) => setDateLeft(e.target.value)}
          />
          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !dateLeft}>
              {saving ? "Saving…" : "Mark left"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
