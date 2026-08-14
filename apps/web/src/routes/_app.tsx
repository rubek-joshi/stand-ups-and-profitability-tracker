import * as React from "react"
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@workspace/ui/components/sidebar"
import { Separator } from "@workspace/ui/components/separator"
import { AppSidebar } from "@/components/app-sidebar"
import { CommandPalette } from "@/components/command-palette"
import { getToken } from "@/lib/api"
import { useAuth } from "@/lib/auth"
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
  const { loading, token } = useAuth()
  const navigate = Route.useNavigate()

  React.useEffect(() => {
    if (!loading && !token) {
      void navigate({ to: "/login" })
    }
  }, [loading, token, navigate])

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <LoadingState label="Checking session…" />
      </div>
    )
  }

  if (!token) return null

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3 md:hidden">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4" />
          <span className="text-sm font-medium">Tracker</span>
        </header>
        <div className="flex-1 p-4 md:p-6">
          <Outlet />
        </div>
      </SidebarInset>
      <CommandPalette />
    </SidebarProvider>
  )
}
