import * as React from "react"
import { Outlet, createFileRoute, redirect, useRouterState } from "@tanstack/react-router"
import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar"
import { TooltipProvider } from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"
import { AppHeader } from "@/components/app-header"
import { AppSidebar } from "@/components/app-sidebar"
import { CommandPalette } from "@/components/command-palette"
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts"
import { getToken } from "@/lib/api"
import { homePathForRole } from "@/lib/access"
import { useAuth } from "@/lib/auth"
import { isAppPathAllowed } from "@/lib/nav"
import { PAGE_CONTAINER_CLASS } from "@/lib/layout"
import { LoadingState } from "@/components/ui-states"

export const Route = createFileRoute("/_app")({
  ssr: false,
  beforeLoad: () => {
    // localStorage is only available in the browser
    if (typeof window !== "undefined" && !getToken()) {
      throw redirect({ to: "/login" })
    }
  },
  component: AppLayout,
})

function AppLayout() {
  const { loading, token, user } = useAuth()
  const navigate = Route.useNavigate()
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  React.useEffect(() => {
    if (!loading && !token) {
      void navigate({ to: "/login" })
    }
  }, [loading, token, navigate])

  React.useEffect(() => {
    if (!loading && token && user?.mustChangePassword) {
      void navigate({ to: "/change-password" })
    }
  }, [loading, token, user?.mustChangePassword, navigate])

  React.useEffect(() => {
    if (loading || !token || !user || user.mustChangePassword) return
    if (!isAppPathAllowed(pathname, user.role)) {
      void navigate({ to: homePathForRole(user.role) })
    }
  }, [loading, token, user, pathname, navigate])

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <LoadingState label="Checking session…" />
      </div>
    )
  }

  if (!token) return null
  if (user?.mustChangePassword) return null

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <AppHeader />
          <div className={cn("flex-1 p-4 md:p-6", PAGE_CONTAINER_CLASS)}>
            <Outlet />
          </div>
        </SidebarInset>
        <CommandPalette />
        <KeyboardShortcuts />
      </SidebarProvider>
    </TooltipProvider>
  )
}
