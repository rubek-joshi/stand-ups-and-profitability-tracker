import * as React from "react"
import { Link, useRouterState } from "@tanstack/react-router"
import { IconChevronRight } from "@tabler/icons-react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"
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
import { cn } from "@workspace/ui/lib/utils"
import { navGroupsForRole, type NavGroup, type NavItem } from "@/lib/nav"
import { homePathForRole } from "@/lib/access"
import { useAuth } from "@/lib/auth"

function isItemActive(pathname: string, item: NavItem) {
  return item.to === "/"
    ? pathname === "/"
    : pathname === item.to || pathname.startsWith(`${item.to}/`)
}

function NavMenuItems({
  items,
  pathname,
  onNavigate,
  className,
}: {
  items: NavItem[]
  pathname: string
  onNavigate: () => void
  className?: string
}) {
  return (
    <SidebarMenu className={className}>
      {items.map((item) => (
        <SidebarMenuItem key={item.to}>
          <SidebarMenuButton
            isActive={isItemActive(pathname, item)}
            tooltip={item.title}
            render={<Link to={item.to} onClick={onNavigate} />}
          >
            <item.icon />
            <span>{item.title}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  )
}

function CollapsibleNavGroup({
  group,
  pathname,
  onNavigate,
}: {
  group: NavGroup
  pathname: string
  onNavigate: () => void
}) {
  const hasActiveChild = group.items.some((item) =>
    isItemActive(pathname, item),
  )
  const [open, setOpen] = React.useState(
    () => group.id === "work" || hasActiveChild,
  )

  React.useEffect(() => {
    if (hasActiveChild) setOpen(true)
  }, [hasActiveChild])

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="group/collapsible"
    >
      <SidebarGroup className="py-0">
        <SidebarGroupLabel
          render={<CollapsibleTrigger />}
          className="cursor-pointer hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          {group.title}
          <IconChevronRight
            className={cn(
              "ml-auto transition-transform",
              open && "rotate-90",
            )}
          />
        </SidebarGroupLabel>
        <CollapsibleContent>
          <SidebarGroupContent>
            <NavMenuItems
              items={group.items}
              pathname={pathname}
              onNavigate={onNavigate}
              className="pl-2"
            />
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  )
}

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const { user } = useAuth()
  const { isMobile, setOpenMobile } = useSidebar()
  const groups = navGroupsForRole(user?.role)
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
      <SidebarContent className="gap-0">
        {groups.map((group) =>
          group.collapsible ? (
            <CollapsibleNavGroup
              key={group.id}
              group={group}
              pathname={pathname}
              onNavigate={dismissMobile}
            />
          ) : (
            <SidebarGroup key={group.id} className="py-0">
              <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
              <SidebarGroupContent>
                <NavMenuItems
                  items={group.items}
                  pathname={pathname}
                  onNavigate={dismissMobile}
                />
              </SidebarGroupContent>
            </SidebarGroup>
          ),
        )}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
