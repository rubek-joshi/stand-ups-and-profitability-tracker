import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@workspace/ui/components/command"
import { api, type Envelope } from "@/lib/api"
import { NAV_ITEMS } from "@/lib/nav"
import { getRecents, pushRecent, type RecentItem } from "@/lib/recents"
import type { Client, CoreMember, Employee, Project } from "@/lib/types"

type SearchEntity = {
  id: string
  label: string
  to: string
  group: string
}

export function CommandPalette() {
  const navigate = useNavigate()
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [recents, setRecents] = React.useState<RecentItem[]>([])
  const [entities, setEntities] = React.useState<SearchEntity[]>([])

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  React.useEffect(() => {
    if (!open) return
    setRecents(getRecents())
    setQuery("")
    let cancelled = false
    ;(async () => {
      try {
        const [clients, projects, employees, coreMembers] = await Promise.all([
          api<Envelope<Client[]>>("/clients"),
          api<Envelope<Project[]>>("/projects"),
          api<Envelope<Employee[]>>("/employees"),
          api<Envelope<CoreMember[]>>("/core-members"),
        ])
        if (cancelled) return
        const list: SearchEntity[] = [
          ...clients.data.map((c) => ({
            id: `client:${c.id}`,
            label: c.name,
            to: `/clients/${c.id}`,
            group: "Clients",
          })),
          ...projects.data.map((p) => ({
            id: `project:${p.id}`,
            label: p.name,
            to: `/projects/${p.id}`,
            group: "Projects",
          })),
          ...employees.data.map((e) => ({
            id: `employee:${e.id}`,
            label: e.name,
            to: `/employees/${e.id}`,
            group: "Employees",
          })),
          ...coreMembers.data.map((m) => ({
            id: `core:${m.id}`,
            label: m.name,
            to: `/core-members/${m.id}`,
            group: "Core Members",
          })),
        ]
        setEntities(list)
      } catch {
        setEntities([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open])

  const go = (item: { id: string; label: string; to: string; group: string }) => {
    pushRecent(item)
    setOpen(false)
    void navigate({ to: item.to })
  }

  const q = query.trim().toLowerCase()
  const navMatches = NAV_ITEMS.filter((n) => {
    if (!q) return true
    return (
      n.title.toLowerCase().includes(q) ||
      n.keywords?.some((k) => k.includes(q)) ||
      n.to.toLowerCase().includes(q)
    )
  })
  const entityMatches = entities.filter((e) => !q || e.label.toLowerCase().includes(q))

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Command palette" description="Search">
      <CommandInput placeholder="Search pages, clients, projects…" value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>No results</CommandEmpty>
        {!q && recents.length > 0 ? (
          <CommandGroup heading="Recent">
            {recents.map((r) => (
              <CommandItem key={r.id} value={`recent-${r.id}`} onSelect={() => go(r)}>
                <span className="truncate">{r.label}</span>
                <span className="ml-auto text-xs text-muted-foreground">{r.group}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
        {!q && recents.length > 0 ? <CommandSeparator /> : null}
        {navMatches.length > 0 ? (
          <CommandGroup heading="Navigation">
            {navMatches.map((n) => (
              <CommandItem
                key={n.to}
                value={`nav-${n.title}`}
                onSelect={() =>
                  go({ id: `nav:${n.to}`, label: n.title, to: n.to, group: "Navigation" })
                }
              >
                <n.icon className="size-4" />
                {n.title}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
        {["Clients", "Projects", "Employees", "Core Members"].map((group) => {
          const items = entityMatches.filter((e) => e.group === group)
          if (!items.length) return null
          return (
            <CommandGroup key={group} heading={group}>
              {items.slice(0, 20).map((e) => (
                <CommandItem key={e.id} value={`${group}-${e.label}-${e.id}`} onSelect={() => go(e)}>
                  <span className="truncate">{e.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )
        })}
      </CommandList>
    </CommandDialog>
  )
}
