import * as React from "react"
import { IconKeyboard } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Kbd, KbdGroup } from "@workspace/ui/components/kbd"
import {
  formatShortcutKey,
  isApplePlatform,
  primaryModifierPressed,
} from "@/lib/keyboard"
import { useTheme } from "@/lib/theme"

export const SHORTCUTS_FAB_BOTTOM_CLASS = "bottom-20 md:bottom-20"

const GLOBAL_SHORTCUTS: Array<{ keys: string[]; description: string }> = [
  { keys: ["Ctrl", "K"], description: "Open command palette" },
  { keys: ["Ctrl", "B"], description: "Toggle sidebar" },
  { keys: ["Ctrl", "J"], description: "Toggle light / dark mode" },
  { keys: ["Shift", "/"], description: "Show keyboard shortcuts" },
]

const STANDUP_SHORTCUTS: Array<{ keys: string[]; description: string }> = [
  { keys: ["Ctrl", "Enter"], description: "Next project / employee" },
  { keys: ["Ctrl", "Shift", "V"], description: "Toggle card / table view" },
  { keys: ["Ctrl", "Shift", "A"], description: "Toggle Absent / Present" },
  { keys: ["Ctrl", "Shift", "N"], description: "Toggle miscellaneous notes" },
  { keys: ["Ctrl", "Shift", "B"], description: "Add blocker to focused task" },
  { keys: ["Alt", "P"], description: "Mark task in progress" },
  { keys: ["Alt", "T"], description: "Move task to tomorrow" },
  { keys: ["Alt", "Enter"], description: "Mark task complete" },
]

function ShortcutList({
  shortcuts,
  apple,
}: {
  shortcuts: Array<{ keys: string[]; description: string }>
  apple: boolean
}) {
  return (
    <ul className="flex flex-col gap-3">
      {shortcuts.map((shortcut) => (
        <li
          key={shortcut.description}
          className="flex items-center justify-between gap-4"
        >
          <span className="text-sm">{shortcut.description}</span>
          <KbdGroup>
            {shortcut.keys.map((key) => (
              <Kbd key={key}>{formatShortcutKey(key, apple)}</Kbd>
            ))}
          </KbdGroup>
        </li>
      ))}
    </ul>
  )
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT"
}

export function KeyboardShortcuts() {
  const { toggleTheme } = useTheme()
  const [open, setOpen] = React.useState(false)
  const [apple, setApple] = React.useState(false)

  React.useEffect(() => {
    setApple(isApplePlatform())
  }, [])

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      const withModifier = primaryModifierPressed(event)

      if (withModifier && !event.altKey && !event.shiftKey && key === "j") {
        event.preventDefault()
        toggleTheme()
        return
      }

      if (withModifier && !event.altKey && !event.shiftKey && event.key === "/") {
        event.preventDefault()
        setOpen((value) => !value)
        return
      }

      if (
        !withModifier &&
        !event.altKey &&
        event.key === "?" &&
        !isEditableTarget(event.target)
      ) {
        event.preventDefault()
        setOpen((value) => !value)
      }
    }

    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [toggleTheme])

  return (
    <>
      <Button
        type="button"
        size="icon"
        variant="secondary"
        aria-label="Keyboard shortcuts"
        className="fixed right-4 bottom-4 z-30 size-10 rounded-full shadow-md md:right-6 md:bottom-6"
        onClick={() => setOpen(true)}
      >
        <IconKeyboard />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
            <DialogDescription>
              {apple
                ? "On Mac, Ctrl is ⌘, Alt is ⌥, and Shift is ⇧."
                : "Shortcuts available in the app and on stand-up pages."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-5">
            <section className="space-y-3">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Global
              </h3>
              <ShortcutList shortcuts={GLOBAL_SHORTCUTS} apple={apple} />
            </section>
            <section className="space-y-3">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Stand-up page
              </h3>
              <ShortcutList shortcuts={STANDUP_SHORTCUTS} apple={apple} />
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
