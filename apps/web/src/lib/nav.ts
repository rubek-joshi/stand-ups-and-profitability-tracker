import {
  IconAdjustments,
  IconBuilding,
  IconCategory,
  IconClipboardList,
  IconLayoutDashboard,
  IconReceiptTax,
  IconSettings,
  IconUsers,
  IconUserStar,
  IconBriefcase,
} from "@tabler/icons-react"
import type { ComponentType } from "react"

export type NavItem = {
  title: string
  to: string
  icon: ComponentType<{ className?: string }>
  keywords?: string[]
}

export const NAV_ITEMS: NavItem[] = [
  { title: "Dashboard", to: "/", icon: IconLayoutDashboard, keywords: ["home", "stats"] },
  { title: "Clients", to: "/clients", icon: IconBuilding },
  { title: "Projects", to: "/projects", icon: IconBriefcase },
  { title: "Employees", to: "/employees", icon: IconUsers },
  { title: "Core Members", to: "/core-members", icon: IconUserStar, keywords: ["core"] },
  { title: "Stand-ups", to: "/standups", icon: IconClipboardList, keywords: ["standup"] },
  { title: "Categories", to: "/categories", icon: IconCategory },
  { title: "VAT", to: "/vat", icon: IconReceiptTax },
  { title: "Audit", to: "/audit", icon: IconAdjustments, keywords: ["logs"] },
  { title: "Settings", to: "/settings", icon: IconSettings },
]
