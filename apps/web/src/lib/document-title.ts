export const APP_TITLE = "Tracker"

export function documentTitle(page?: string | null) {
  const trimmed = page?.trim()
  return trimmed ? `${trimmed} | ${APP_TITLE}` : APP_TITLE
}
