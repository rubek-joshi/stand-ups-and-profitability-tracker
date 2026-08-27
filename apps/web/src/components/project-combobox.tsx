import * as React from "react"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@workspace/ui/components/combobox"
import { api, ApiError } from "@/lib/api"
import type { Envelope, PaginatedEnvelope } from "@/lib/api"
import { buildListQuery } from "@/lib/list-query"
import type { Project } from "@/lib/types"

const RESULT_LIMIT = 20

type ProjectOption = Pick<Project, "id" | "name"> & {
  client?: { id: string; name: string } | null
}

function projectLabel(project: ProjectOption) {
  return project.client?.name
    ? `${project.name} · ${project.client.name}`
    : project.name
}

export function ProjectCombobox({
  value,
  onValueChange,
  clientId,
  placeholder = "Search projects…",
  allowClear = false,
  disabled,
  className,
}: {
  value?: string
  onValueChange: (projectId: string | undefined) => void
  clientId?: string
  placeholder?: string
  allowClear?: boolean
  disabled?: boolean
  className?: string
}) {
  const [query, setQuery] = React.useState("")
  const [projects, setProjects] = React.useState<ProjectOption[]>([])
  const [selected, setSelected] = React.useState<ProjectOption | null>(null)
  const [loading, setLoading] = React.useState(false)

  const load = React.useCallback(
    async (q: string) => {
      setLoading(true)
      try {
        const qs = buildListQuery({
          q: q.trim() || undefined,
          clientId,
          page: 1,
          pageSize: RESULT_LIMIT,
        })
        const res = await api<PaginatedEnvelope<ProjectOption[]>>(
          `/projects?${qs}`,
        )
        setProjects(res.data)
      } catch (err) {
        if (err instanceof ApiError) {
          setProjects([])
        }
      } finally {
        setLoading(false)
      }
    },
    [clientId],
  )

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      void load(query)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [query, load])

  React.useEffect(() => {
    if (!value) {
      setSelected(null)
      return
    }
    const match = projects.find((project) => project.id === value)
    if (match) {
      setSelected(match)
      return
    }
    const request = { cancelled: false }
    void api<Envelope<ProjectOption>>(`/projects/${value}`)
      .then((res) => {
        if (!request.cancelled) setSelected(res.data)
      })
      .catch(() => {
        if (!request.cancelled) setSelected(null)
      })
    return () => {
      request.cancelled = true
    }
  }, [value, projects])

  const items = React.useMemo(() => {
    const list = [...projects]
    if (selected && !list.some((project) => project.id === selected.id)) {
      list.unshift(selected)
    }
    return list.slice(0, RESULT_LIMIT)
  }, [projects, selected])

  return (
    <Combobox
      items={items}
      value={selected}
      onValueChange={(next) => {
        onValueChange(next?.id)
        setQuery("")
      }}
      itemToStringLabel={projectLabel}
      isItemEqualToValue={(a, b) => a.id === b.id}
      filter={null}
      onInputValueChange={(next, details) => {
        if (
          details.reason !== "input-change" &&
          details.reason !== "input-clear" &&
          details.reason !== "clear-press"
        ) {
          return
        }
        setQuery(next)
      }}
      disabled={disabled}
    >
      <ComboboxInput
        className={className}
        placeholder={placeholder}
        showClear={allowClear}
        disabled={disabled}
      />
      <ComboboxContent>
        <ComboboxEmpty>
          {loading ? "Searching…" : "No projects found"}
        </ComboboxEmpty>
        <ComboboxList>
          {(project: ProjectOption) => (
            <ComboboxItem key={project.id} value={project}>
              {projectLabel(project)}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
