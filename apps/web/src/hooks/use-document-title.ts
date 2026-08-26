import * as React from "react"
import { documentTitle } from "@/lib/document-title"

/** Sets `document.title` to `{page} | Tracker`. */
export function useDocumentTitle(page?: string | null) {
  const full = documentTitle(page)

  React.useLayoutEffect(() => {
    document.title = full
  }, [full])
}
