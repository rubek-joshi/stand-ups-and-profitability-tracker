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
import { useTheme } from "@/lib/theme"

export const SHORTCUTS_FAB_BOTTOM_CLASS = "bottom-20 md:bottom-20"

const SHORTCUTS: Array<{ keys: string[]; description: string }> = [
  { keys: ["Ctrl", "K"], description: "Open command palette" },
  { keys: ["Ctrl", "B"], description: "Toggle sidebar" },
  { keys: ["Ctrl", "J"], description: "Toggle light / dark mode" },
  { keys: ["Shift", "/"], description: "Show keyboard shortcuts" },
]

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT"
}

function modifierLabel() {
  if (typeof navigator === "undefined") return "Ctrl"
  return /Mac|iPhone|iPod|iPad/.test(navigator.platform) ? "⌘" : "Ctrl"
}

export function KeyboardShortcuts() {
  const { toggleTheme } = useTheme()
  const [open, setOpen] = React.useState(false)
  const [modifier, setModifier] = React.useState("Ctrl")

  React.useEffect(() => {
    setModifier(modifierLabel())
  }, [])

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      const withModifier = event.ctrlKey || event.metaKey

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
              Global shortcuts available throughout the app.
            </DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col gap-3">
            {SHORTCUTS.map((shortcut) => (
              <li
                key={shortcut.description}
                className="flex items-center justify-between gap-4"
              >
                <span className="text-sm">{shortcut.description}</span>
                <KbdGroup>
                  {shortcut.keys.map((key) => (
                    <Kbd key={key}>{key === "Ctrl" ? modifier : key}</Kbd>
                  ))}
                </KbdGroup>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  )
}
