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
import { formatNpr } from "@/lib/money"
import type { AmcRecord } from "@/lib/types"

const RESULT_LIMIT = 20

type AmcOption = Pick<
  AmcRecord,
  "id" | "projectId" | "type" | "startDate" | "endDate" | "amcAmountPaisa" | "status"
> & {
  projectName?: string | null
  clientName?: string | null
  isVatApplicable?: boolean
  project?: {
    id: string
    name: string
    clientId?: string
    vatRateApplied?: number
    client?: { id: string; name: string }
  }
}

function amcLabel(amc: AmcOption) {
  const project =
    amc.projectName ?? amc.project?.name ?? "Project"
  const client = amc.clientName ?? amc.project?.client?.name
  const amount =
    amc.amcAmountPaisa != null ? formatNpr(amc.amcAmountPaisa) : "—"
  const range = `${String(amc.startDate).slice(0, 10)} → ${String(amc.endDate).slice(0, 10)}`
  return client
    ? `${project} · ${client} · ${amount} (${range})`
    : `${project} · ${amount} (${range})`
}

export function AmcCombobox({
  value,
  onValueChange,
  projectId,
  clientId,
  placeholder = "Search paid AMCs…",
  allowClear = false,
  disabled,
  className,
}: {
  value?: string
  onValueChange: (amcId: string | undefined, amc?: AmcOption) => void
  projectId?: string
  clientId?: string
  placeholder?: string
  allowClear?: boolean
  disabled?: boolean
  className?: string
}) {
  const [query, setQuery] = React.useState("")
  const [amcs, setAmcs] = React.useState<AmcOption[]>([])
  const [selected, setSelected] = React.useState<AmcOption | null>(null)
  const [loading, setLoading] = React.useState(false)

  const load = React.useCallback(
    async (q: string) => {
      setLoading(true)
      try {
        const qs = buildListQuery({
          q: q.trim() || undefined,
          type: "paid",
          projectId,
          clientId,
          page: 1,
          pageSize: RESULT_LIMIT,
        })
        const res = await api<PaginatedEnvelope<AmcOption[]>>(`/amc?${qs}`)
        setAmcs(
          res.data.filter(
            (row) => row.type === "paid" && row.status !== "cancelled",
          ),
        )
      } catch (err) {
        if (err instanceof ApiError) {
          setAmcs([])
        }
      } finally {
        setLoading(false)
      }
    },
    [projectId, clientId],
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
    const match = amcs.find((amc) => amc.id === value)
    if (match) {
      setSelected(match)
      return
    }
    const request = { cancelled: false }
    void api<Envelope<AmcOption>>(`/amc/${value}`)
      .then((res) => {
        if (!request.cancelled) setSelected(res.data)
      })
      .catch(() => {
        if (!request.cancelled) setSelected(null)
      })
    return () => {
      request.cancelled = true
    }
  }, [value, amcs])

  const items = React.useMemo(() => {
    const list = [...amcs]
    if (selected && !list.some((amc) => amc.id === selected.id)) {
      list.unshift(selected)
    }
    return list.slice(0, RESULT_LIMIT)
  }, [amcs, selected])

  return (
    <Combobox
      items={items}
      value={selected}
      onValueChange={(next) => {
        onValueChange(next?.id, next ?? undefined)
        setQuery("")
      }}
      itemToStringLabel={amcLabel}
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
          {loading ? "Searching…" : "No paid AMCs found"}
        </ComboboxEmpty>
        <ComboboxList>
          {(amc: AmcOption) => (
            <ComboboxItem key={amc.id} value={amc}>
              {amcLabel(amc)}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
