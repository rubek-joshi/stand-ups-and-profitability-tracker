export type StandupViewScopeSearch = {
  viewScope?: "group" | "everyone"
  groupId?: string
}

export function parseStandupViewScopeSearch(
  search: Record<string, unknown>,
): StandupViewScopeSearch {
  const viewScope =
    search.viewScope === "group"
      ? ("group" as const)
      : search.viewScope === "everyone"
        ? ("everyone" as const)
        : undefined
  const groupId =
    typeof search.groupId === "string" && search.groupId.trim()
      ? search.groupId.trim()
      : undefined

  if (viewScope === "group" && groupId) {
    return { viewScope, groupId }
  }
  if (viewScope === "everyone") {
    return { viewScope }
  }
  return {}
}

export function resolveStandupActiveGroupId(input: {
  viewScope?: "group" | "everyone"
  groupId?: string
  profileScope?: "ask" | "everyone" | "group"
  profileGroupId?: string | null
}): string | null {
  if (input.viewScope === "group" && input.groupId) {
    return input.groupId
  }
  if (input.viewScope === "everyone") {
    return null
  }
  if (input.profileScope === "group" && input.profileGroupId) {
    return input.profileGroupId
  }
  return null
}

export function initialShowAllEmployees(input: {
  viewScope?: "group" | "everyone"
  groupId?: string
  profileScope?: "ask" | "everyone" | "group"
}): boolean {
  if (input.viewScope === "group" && input.groupId) {
    return false
  }
  if (input.viewScope === "everyone") {
    return true
  }
  return input.profileScope !== "group"
}
