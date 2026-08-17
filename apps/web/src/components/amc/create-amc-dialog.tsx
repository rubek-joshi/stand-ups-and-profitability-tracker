import * as React from "react"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Textarea } from "@workspace/ui/components/textarea"
import { api, ApiError, type Envelope } from "@/lib/api"
import { addMonths } from "@/lib/amc"
import { parseNprInput } from "@/lib/money"
import type { AmcRecord, AmcType, Project } from "@/lib/types"

const DURATIONS = [3, 6, 12, 24]

type ProjectOption = Pick<Project, "id" | "name" | "status"> & {
  client?: { id: string; name: string } | null
}

export function CreateAmcDialog({
  open,
  onOpenChange,
  onCreated,
  presetProjectId,
  lockProject = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: (amc: AmcRecord) => void
  presetProjectId?: string
  lockProject?: boolean
}) {
  const [projects, setProjects] = React.useState<ProjectOption[]>([])
  const [loadingProjects, setLoadingProjects] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [projectId, setProjectId] = React.useState(presetProjectId ?? "")
  const [type, setType] = React.useState<AmcType>("complimentary")
  const [months, setMonths] = React.useState("12")
  const [startDate, setStartDate] = React.useState(
    () => new Date().toISOString().slice(0, 10),
  )
  const [value, setValue] = React.useState("")
  const [notes, setNotes] = React.useState("")
  const [isVatApplicable, setIsVatApplicable] = React.useState(true)

  React.useEffect(() => {
    if (!open) return
    setError(null)
    setProjectId(presetProjectId ?? "")
    setType("complimentary")
    setMonths("12")
    setStartDate(new Date().toISOString().slice(0, 10))
    setValue("")
    setNotes("")
    setIsVatApplicable(true)

    if (lockProject && presetProjectId) return

    let cancelled = false
    setLoadingProjects(true)
    void (async () => {
      try {
        const res = await api<Envelope<ProjectOption[]>>("/projects")
        if (cancelled) return
        setProjects(
          res.data.filter(
            (p) => p.status === "closed" || p.status === "under_amc",
          ),
        )
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "Failed to load projects")
        }
      } finally {
        if (!cancelled) setLoadingProjects(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, presetProjectId, lockProject])

  const projectItems = React.useMemo(
    () =>
      Object.fromEntries(
        projects.map((p) => [
          p.id,
          p.client?.name ? `${p.name} · ${p.client.name}` : p.name,
        ]),
      ),
    [projects],
  )

  const endDate = addMonths(startDate, Number(months))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create AMC</DialogTitle>
          <DialogDescription>
            Attach a complimentary or paid maintenance contract to a project.
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4 py-2"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!projectId) {
              setError("Pick a project first")
              return
            }
            setSaving(true)
            setError(null)
            try {
              const res = await api<Envelope<AmcRecord>>("/amc", {
                method: "POST",
                body: {
                  projectId,
                  type,
                  startDate,
                  endDate,
                  notes: notes.trim() || undefined,
                  isVatApplicable,
                  amcAmountNpr:
                    type === "paid" && value.trim()
                      ? parseNprInput(value)
                      : undefined,
                },
              })
              onCreated?.(res.data)
              onOpenChange(false)
            } catch (err) {
              setError(err instanceof ApiError ? err.message : "Failed to create AMC")
            } finally {
              setSaving(false)
            }
          }}
        >
          {!lockProject ? (
            <div className="grid gap-2">
              <Label>Project</Label>
              <Select
                value={projectId || null}
                onValueChange={(v) => setProjectId(v ?? "")}
                items={projectItems}
                disabled={loadingProjects || projects.length === 0}
              >
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={
                      loadingProjects
                        ? "Loading…"
                        : projects.length === 0
                          ? "No closed projects"
                          : "Choose a project"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.client?.name ? `${p.name} · ${p.client.name}` : p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="grid gap-2">
            <Label>Type</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["complimentary", "paid"] as AmcType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`rounded-lg border px-3 py-2.5 text-sm font-medium capitalize transition-colors ${
                    type === t
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="amc-start">Start date</Label>
              <Input
                id="amc-start"
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Duration</Label>
              <Select
                value={months}
                onValueChange={(v) => setMonths(v ?? "12")}
                items={Object.fromEntries(
                  DURATIONS.map((m) => [String(m), `${m} months`]),
                )}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATIONS.map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {m} months
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Ends {endDate}</p>
            </div>
          </div>

          {type === "paid" ? (
            <div className="grid gap-2">
              <Label htmlFor="amc-value">Contract value (NPR)</Label>
              <Input
                id="amc-value"
                required
                placeholder="180000"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
          ) : null}

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={isVatApplicable}
              onCheckedChange={(v) => setIsVatApplicable(Boolean(v))}
            />
            VAT applicable
          </label>

          <div className="grid gap-2">
            <Label htmlFor="amc-notes">Notes</Label>
            <Textarea
              id="amc-notes"
              rows={2}
              placeholder="Scope, SLA, billing cadence…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving || (!lockProject && !projectId)}>
              {saving ? "Creating…" : "Create AMC"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
