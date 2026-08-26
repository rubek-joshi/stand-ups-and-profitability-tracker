export const DEFAULT_FAVICON = "/logo.svg"

export function faviconForPath(pathname: string): string {
  if (pathname === "/stand-ups" || pathname.startsWith("/stand-ups/")) {
    return "/stand-ups.svg"
  }
  if (pathname === "/audit" || pathname.startsWith("/audit/")) {
    return "/audit.svg"
  }
  return DEFAULT_FAVICON
}
