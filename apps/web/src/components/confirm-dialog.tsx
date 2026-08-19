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

type ConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  loading?: boolean
  confirmPhrase?: string
  onConfirm: () => void | Promise<void>
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  loading = false,
  confirmPhrase,
  onConfirm,
}: ConfirmDialogProps) {
  const [busy, setBusy] = React.useState(false)
  const [phrase, setPhrase] = React.useState("")
  const isBusy = busy || loading
  const phraseOk = !confirmPhrase || phrase === confirmPhrase

  React.useEffect(() => {
    if (open) setPhrase("")
  }, [open])

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen, eventDetails) => {
        if (!nextOpen && isBusy) {
          eventDetails?.cancel?.()
          return
        }
        onOpenChange(nextOpen)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {confirmPhrase ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm-phrase">
              Type <span className="font-medium text-foreground">{confirmPhrase}</span>{" "}
              to continue
            </Label>
            <Input
              id="confirm-phrase"
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              disabled={isBusy}
            />
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isBusy}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "destructive" : "default"}
            disabled={isBusy || !phraseOk}
            onClick={async (e) => {
              e.preventDefault()
              setBusy(true)
              try {
                await onConfirm()
                onOpenChange(false)
              } finally {
                setBusy(false)
              }
            }}
          >
            {isBusy ? "Working…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

type ConfirmOptions = {
  title: string
  description: string
  confirmLabel?: string
  destructive?: boolean
  confirmPhrase?: string
}

export function useConfirmDialog() {
  const [state, setState] = React.useState<
    (ConfirmOptions & { open: boolean; resolve?: (ok: boolean) => void }) | null
  >(null)

  const confirm = React.useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({ ...options, open: true, resolve })
    })
  }, [])

  const dialog = state ? (
    <ConfirmDialog
      open={state.open}
      onOpenChange={(open) => {
        if (!open) {
          state.resolve?.(false)
          setState(null)
        }
      }}
      title={state.title}
      description={state.description}
      confirmLabel={state.confirmLabel}
      destructive={state.destructive}
      confirmPhrase={state.confirmPhrase}
      onConfirm={async () => {
        state.resolve?.(true)
        setState(null)
      }}
    />
  ) : null

  return { confirm, dialog }
}
