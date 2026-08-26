import * as React from "react"

/** Points every `rel="icon"` link at `href` (creates one if missing). */
export function useFavicon(href: string) {
  React.useLayoutEffect(() => {
    const links = document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]')
    if (links.length === 0) {
      const link = document.createElement("link")
      link.rel = "icon"
      link.type = "image/svg+xml"
      link.href = href
      document.head.appendChild(link)
      return
    }
    for (const link of links) {
      link.type = "image/svg+xml"
      link.href = href
    }
  }, [href])
}
