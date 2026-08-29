import type { UserRole } from "@/lib/types"

export const STAFF_ROLES: UserRole[] = ["super_admin", "admin", "manager"]
export const AUDIT_ROLES: UserRole[] = ["super_admin", "admin"]
export const SETTINGS_ROLES: UserRole[] = ["super_admin"]

export function homePathForRole(role: string | null | undefined): "/stand-ups" | "/" {
  return role === "standup_taker" ? "/stand-ups" : "/"
}

export function isStaffRole(role: string | null | undefined): boolean {
  return Boolean(role && (STAFF_ROLES as string[]).includes(role))
}

export function isSuperAdmin(role: string | null | undefined): boolean {
  return role === "super_admin"
}
