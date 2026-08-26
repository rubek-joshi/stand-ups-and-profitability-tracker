import {
  IconScanTraces,
  IconBuilding,
  IconCategory,
  IconClipboardList,
  IconLayoutDashboard,
  IconReceiptTax,
  IconSettings,
  IconUsers,
  IconUserCog,
  IconUserStar,
  IconUsersGroup,
  IconBriefcase,
  IconShieldCheck,
} from "@tabler/icons-react"
import type { ComponentType } from "react"
import { AUDIT_ROLES, STAFF_ROLES } from "@/lib/access"
import type { UserRole } from "@/lib/types"

export type NavItem = {
  title: string
  to: string
  icon: ComponentType<{ className?: string }>
  keywords?: string[]
  roles?: UserRole[]
}

export type NavGroup = {
  id: string
  title: string
  collapsible?: boolean
  items: NavItem[]
}

export const NAV_ITEMS: NavItem[] = [
  {
    title: "Dashboard",
    to: "/",
    icon: IconLayoutDashboard,
    keywords: ["home", "stats"],
    roles: STAFF_ROLES,
  },
  { title: "Stand-ups", to: "/stand-ups", icon: IconClipboardList, keywords: ["standup"] },
  { title: "Clients", to: "/clients", icon: IconBuilding, roles: STAFF_ROLES },
  { title: "Projects", to: "/projects", icon: IconBriefcase, roles: STAFF_ROLES },
  { title: "AMC", to: "/amc", icon: IconShieldCheck, keywords: ["maintenance", "renewal"], roles: STAFF_ROLES },
  { title: "Employees", to: "/employees", icon: IconUsers, roles: STAFF_ROLES },
  {
    title: "Groups",
    to: "/employee-groups",
    icon: IconUsersGroup,
    keywords: ["department", "team"],
    roles: STAFF_ROLES,
  },
  { title: "Core Members", to: "/core-members", icon: IconUserStar, keywords: ["core"], roles: STAFF_ROLES },
  { title: "Categories", to: "/categories", icon: IconCategory, roles: STAFF_ROLES },
  { title: "VAT", to: "/vat", icon: IconReceiptTax, roles: STAFF_ROLES },
  {
    title: "Users",
    to: "/users",
    icon: IconUserCog,
    keywords: ["accounts", "roles", "admin"],
    roles: STAFF_ROLES,
  },
  { title: "Audit", to: "/audit", icon: IconScanTraces, keywords: ["logs"], roles: AUDIT_ROLES },
  { title: "Settings", to: "/settings", icon: IconSettings, roles: STAFF_ROLES },
]

const byTo = Object.fromEntries(NAV_ITEMS.map((item) => [item.to, item])) as Record<
  string,
  NavItem
>

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "overview",
    title: "Overview",
    items: [byTo["/"]!, byTo["/stand-ups"]!],
  },
  {
    id: "work",
    title: "Work",
    collapsible: true,
    items: [byTo["/clients"]!, byTo["/projects"]!, byTo["/amc"]!],
  },
  {
    id: "Resources",
    title: "Resources",
    collapsible: true,
    items: [
      byTo["/employees"]!,
      byTo["/employee-groups"]!,
      byTo["/core-members"]!,
      byTo["/categories"]!,
    ],
  },
  {
    id: "admin",
    title: "Admin",
    items: [byTo["/vat"]!, byTo["/users"]!, byTo["/audit"]!, byTo["/settings"]!],
  },
]

function itemVisibleForRole(
  item: NavItem,
  role: string | null | undefined,
): boolean {
  return !item.roles || (role != null && item.roles.includes(role as UserRole))
}

export function navItemsForRole(role: string | null | undefined): NavItem[] {
  return NAV_ITEMS.filter((item) => itemVisibleForRole(item, role))
}

export function navGroupsForRole(role: string | null | undefined): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => itemVisibleForRole(item, role)),
  })).filter((group) => group.items.length > 0)
}

function matchingNavItem(pathname: string): NavItem | undefined {
  return NAV_ITEMS.filter((item) =>
    item.to === "/"
      ? pathname === "/"
      : pathname === item.to || pathname.startsWith(`${item.to}/`),
  ).sort((a, b) => b.to.length - a.to.length)[0]
}

/** Section label for the current path (lists, nested routes, and auth screens). */
export function navTitleForPath(pathname: string): string | undefined {
  if (pathname === "/login") return "Login"
  if (pathname === "/change-password") return "Change password"
  if (pathname === "/profile" || pathname.startsWith("/profile")) return "Profile"
  return matchingNavItem(pathname)?.title
}

export function isAppPathAllowed(
  pathname: string,
  role: string | null | undefined,
): boolean {
  if (pathname === "/profile" || pathname.startsWith("/profile")) return true
  const item = matchingNavItem(pathname)
  if (!item) return role !== "standup_taker"
  if (!item.roles) return true
  return Boolean(role && item.roles.includes(role as UserRole))
}
