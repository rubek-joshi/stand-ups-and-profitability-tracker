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
import { STAFF_ROLES } from "@/lib/access"
import type { UserRole } from "@/lib/types"

export type NavItem = {
  title: string
  to: string
  icon: ComponentType<{ className?: string }>
  keywords?: string[]
  roles?: UserRole[]
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
  { title: "Audit", to: "/audit", icon: IconScanTraces, keywords: ["logs"], roles: STAFF_ROLES },
  { title: "Settings", to: "/settings", icon: IconSettings, roles: STAFF_ROLES },
]

export function navItemsForRole(role: string | null | undefined): NavItem[] {
  return NAV_ITEMS.filter(
    (item) => !item.roles || (role != null && item.roles.includes(role as UserRole)),
  )
}

function matchingNavItem(pathname: string): NavItem | undefined {
  return NAV_ITEMS.filter((item) =>
    item.to === "/"
      ? pathname === "/"
      : pathname === item.to || pathname.startsWith(`${item.to}/`),
  ).sort((a, b) => b.to.length - a.to.length)[0]
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
