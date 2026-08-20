/** Shared keyboard / platform helpers for shortcut handling and display. */

export function isApplePlatform() {
  if (typeof navigator === "undefined") return false
  const nav = navigator as Navigator & {
    userAgentData?: { platform?: string }
  }
  const platform = nav.userAgentData?.platform || nav.platform || ""
  if (/Mac|iPhone|iPod|iPad/i.test(platform)) return true
  // iPadOS 13+ can report as MacIntel with touch points.
  if (platform === "MacIntel" && navigator.maxTouchPoints > 1) return true
  return /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent)
}

/** Primary modifier pressed: ⌘ on Apple, Ctrl elsewhere (either accepted). */
export function primaryModifierPressed(event: {
  ctrlKey: boolean
  metaKey: boolean
}) {
  return event.ctrlKey || event.metaKey
}

/** Label for the primary modifier in shortcut UI. */
export function primaryModifierLabel(apple = isApplePlatform()) {
  return apple ? "⌘" : "Ctrl"
}

/** Map a shortcut token to the platform-appropriate glyph / label. */
export function formatShortcutKey(key: string, apple = isApplePlatform()) {
  if (!apple) return key
  switch (key) {
    case "Ctrl":
      return "⌘"
    case "Shift":
      return "⇧"
    case "Alt":
      return "⌥"
    case "Enter":
      return "⏎"
    case "Backspace":
      return "⌫"
    case "Esc":
    case "Escape":
      return "esc"
    default:
      return key
  }
}
