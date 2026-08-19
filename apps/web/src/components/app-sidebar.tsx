import { Link, useNavigate, useRouterState } from "@tanstack/react-router"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "@workspace/ui/components/sidebar"
import { Button } from "@workspace/ui/components/button"
import { IconLogout, IconUser } from "@tabler/icons-react"
import { navItemsForRole } from "@/lib/nav"
import { homePathForRole } from "@/lib/access"
import { useAuth } from "@/lib/auth"
import { useConfirmDialog } from "@/components/confirm-dialog"

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { confirm, dialog } = useConfirmDialog()
  const { isMobile, setOpenMobile } = useSidebar()
  const items = navItemsForRole(user?.role)
  const homeTo = homePathForRole(user?.role)

  const dismissMobile = () => {
    if (isMobile) setOpenMobile(false)
  }

  return (
    <>
      <Sidebar collapsible="icon">
        <SidebarHeader className="gap-1 px-3 py-3">
          <Link
            to={homeTo}
            onClick={dismissMobile}
            className="flex items-center gap-2 truncate font-semibold"
          >
            <span className="truncate">Tracker</span>
          </Link>
          {user ? (
            <Link
              to="/profile"
              onClick={dismissMobile}
              className="truncate text-xs text-muted-foreground hover:text-foreground group-data-[collapsible=icon]:hidden"
            >
              {user.name}
            </Link>
          ) : null}
        </SidebarHeader>
        <SidebarSeparator />
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Navigate</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {items.map((item) => {
                  const active =
                    item.to === "/"
                      ? pathname === "/"
                      : pathname === item.to || pathname.startsWith(`${item.to}/`)
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        isActive={active}
                        tooltip={item.title}
                        render={<Link to={item.to} />}
                      >
                        <item.icon />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="gap-2 p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            render={<Link to="/profile" onClick={dismissMobile} />}
          >
            <IconUser />
            <span className="group-data-[collapsible=icon]:hidden">Profile</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-destructive hover:text-destructive"
            onClick={async () => {
              const ok = await confirm({
                title: "Log out?",
                description: "You will need to sign in again to continue.",
                confirmLabel: "Log out",
                destructive: true,
              })
              if (ok) {
                logout()
                void navigate({ to: "/login" })
              }
            }}
          >
            <IconLogout />
            <span className="group-data-[collapsible=icon]:hidden">Log out</span>
          </Button>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      {dialog}
    </>
  )
}
