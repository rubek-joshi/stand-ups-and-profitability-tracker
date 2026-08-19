import type { UserRole } from "@/lib/types"

export const STAFF_ROLES: UserRole[] = ["super_admin", "admin", "manager"]

export function homePathForRole(role: string | null | undefined): "/stand-ups" | "/" {
  return role === "standup_taker" ? "/stand-ups" : "/"
}

export function isStaffRole(role: string | null | undefined): boolean {
  return Boolean(role && (STAFF_ROLES as string[]).includes(role))
}
