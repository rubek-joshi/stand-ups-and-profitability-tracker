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
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"
import type { AmcRecord } from "@/lib/types"

export function DeclineAmcDialog({
  amc,
  open,
  onOpenChange,
  onConfirm,
}: {
  amc: AmcRecord | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (remark?: string) => void | Promise<void>
}) {
  const [remark, setRemark] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open) setRemark("")
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Decline AMC renewal?</DialogTitle>
          <DialogDescription>
            {amc?.projectName
              ? `${amc.projectName} will move to expired / cancelled.`
              : "This AMC will be cancelled."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="decline-remark">Remark (optional)</Label>
          <Textarea
            id="decline-remark"
            rows={3}
            placeholder="Why did the client decline?"
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={saving}
            onClick={async () => {
              setSaving(true)
              try {
                await onConfirm(remark.trim() || undefined)
                onOpenChange(false)
              } finally {
                setSaving(false)
              }
            }}
          >
            {saving ? "Declining…" : "Decline"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
