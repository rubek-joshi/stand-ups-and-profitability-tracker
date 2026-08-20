import { Link, useRouterState } from "@tanstack/react-router"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@workspace/ui/components/sidebar"
import { navItemsForRole } from "@/lib/nav"
import { homePathForRole } from "@/lib/access"
import { useAuth } from "@/lib/auth"

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const { user } = useAuth()
  const { isMobile, setOpenMobile } = useSidebar()
  const items = navItemsForRole(user?.role)
  const homeTo = homePathForRole(user?.role)

  const dismissMobile = () => {
    if (isMobile) setOpenMobile(false)
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="flex flex-row items-center gap-1 px-2 py-2">
        <Link
          to={homeTo}
          onClick={dismissMobile}
          className="flex min-w-0 flex-1 items-center gap-2 truncate px-1 font-semibold group-data-[collapsible=icon]:hidden"
        >
          <span className="truncate">Tracker</span>
        </Link>

        <SidebarTrigger className="size-8 group-data-[collapsible=icon]:inline-flex" />
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
                      render={<Link to={item.to} onClick={dismissMobile} />}
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
      <SidebarRail />
    </Sidebar>
  )
}
