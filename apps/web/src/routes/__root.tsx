import { HeadContent, Outlet, Scripts, createRootRoute, useRouterState } from "@tanstack/react-router"
import { AuthProvider } from "@/lib/auth"
import { faviconForPath } from "@/lib/favicon"
import { PAGE_CONTAINER_CLASS } from "@/lib/layout"
import { navTitleForPath } from "@/lib/nav"
import { ThemeProvider, themeInitScript } from "@/lib/theme"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useFavicon } from "@/hooks/use-favicon"
import { cn } from "@workspace/ui/lib/utils"
import { Toaster } from "@workspace/ui/components/toast"

import appCss from "@workspace/ui/globals.css?url"

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/logo.svg", type: "image/svg+xml" },
      { rel: "manifest", href: "/manifest.json" },
    ],
  }),
  notFoundComponent: NotFoundPage,
  component: RootComponent,
  shellComponent: RootDocument,
})

function NotFoundPage() {
  useDocumentTitle("Page not found")
  return (
    <main className={cn(PAGE_CONTAINER_CLASS, "p-4 pt-16")}>
      <h1 className="text-xl font-semibold">404</h1>
      <p className="text-muted-foreground">The requested page could not be found.</p>
    </main>
  )
}

function RootComponent() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  useDocumentTitle(navTitleForPath(pathname))
  useFavicon(faviconForPath(pathname))

  return (
    <ThemeProvider>
      <Toaster>
        <AuthProvider>
          <Outlet />
        </AuthProvider>
      </Toaster>
    </ThemeProvider>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <title>Tracker</title>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-svh bg-background text-foreground antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  )
}
