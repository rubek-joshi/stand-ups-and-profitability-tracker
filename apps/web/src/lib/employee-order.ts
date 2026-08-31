export function arrayMove<T>(array: T[], from: number, to: number): T[] {
  if (from === to) return array
  const next = [...array]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

export function sortStandupEntries<
  T extends { employee: { id: string; name: string } },
>(entries: T[], savedOrder?: string[] | null): T[] {
  if (!savedOrder || savedOrder.length === 0) {
    return [...entries].sort((a, b) =>
      a.employee.name.localeCompare(b.employee.name, undefined, {
        sensitivity: "base",
      }),
    )
  }

  const orderMap = new Map<string, number>()
  savedOrder.forEach((id, index) => {
    orderMap.set(id, index)
  })

  const ordered: T[] = []
  const unordered: T[] = []

  for (const entry of entries) {
    if (orderMap.has(entry.employee.id)) {
      ordered.push(entry)
    } else {
      unordered.push(entry)
    }
  }

  ordered.sort((a, b) => {
    const posA = orderMap.get(a.employee.id) ?? 0
    const posB = orderMap.get(b.employee.id) ?? 0
    return posA - posB
  })

  unordered.sort((a, b) =>
    a.employee.name.localeCompare(b.employee.name, undefined, {
      sensitivity: "base",
    }),
  )

  return [...ordered, ...unordered]
}

export function mergeEmployeeOrder(
  masterOrder: string[] | undefined | null,
  visibleEmployeeIds: string[],
  newVisibleOrder: string[],
): string[] {
  const base = Array.isArray(masterOrder) ? [...masterOrder] : []
  const visibleSet = new Set(visibleEmployeeIds)

  if (base.length === 0) {
    return Array.from(new Set(newVisibleOrder))
  }

  const result: string[] = []
  let newVisibleIdx = 0

  for (const id of base) {
    if (visibleSet.has(id)) {
      if (newVisibleIdx < newVisibleOrder.length) {
        result.push(newVisibleOrder[newVisibleIdx++])
      }
    } else {
      result.push(id)
    }
  }

  while (newVisibleIdx < newVisibleOrder.length) {
    result.push(newVisibleOrder[newVisibleIdx++])
  }

  return Array.from(new Set(result))
}
