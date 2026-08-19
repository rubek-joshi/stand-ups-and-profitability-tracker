import type { UserRole } from "@/lib/types"

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super admin",
  admin: "Admin",
  manager: "Manager",
  standup_taker: "Stand-up taker",
}

export const ROLE_ITEMS = Object.fromEntries(
  (Object.keys(ROLE_LABELS) as UserRole[]).map((role) => [role, ROLE_LABELS[role]]),
) as Record<UserRole, string>

export function roleLabel(role: string | null | undefined): string {
  if (!role) return "—"
  if (role in ROLE_LABELS) return ROLE_LABELS[role as UserRole]
  return role
}

export function formatLastLogin(value: string | null | undefined): string {
  if (!value) return "Never"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleString()
}
