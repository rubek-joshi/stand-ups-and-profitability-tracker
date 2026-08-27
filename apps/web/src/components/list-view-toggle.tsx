import { IconLayoutGrid, IconTable } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import type { ListView } from "@/lib/view-pref"

export function ListViewToggle({
  view,
  onChange,
}: {
  view: ListView
  onChange: (view: ListView) => void
}) {
  return (
    <div className="flex items-center gap-1 rounded-md border p-0.5">
      <Button
        type="button"
        size="icon-sm"
        variant={view === "card" ? "secondary" : "ghost"}
        aria-label="Cards"
        aria-pressed={view === "card"}
        onClick={() => onChange("card")}
      >
        <IconLayoutGrid />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant={view === "table" ? "secondary" : "ghost"}
        aria-label="Table"
        aria-pressed={view === "table"}
        onClick={() => onChange("table")}
      >
        <IconTable />
      </Button>
    </div>
  )
}
