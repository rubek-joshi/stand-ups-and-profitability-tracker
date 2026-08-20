import * as React from "react"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Dialog,
  DialogContent,
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
import { Switch } from "@workspace/ui/components/switch"
import { api, ApiError, type Envelope } from "@/lib/api"
import { parseNprInput } from "@/lib/money"
import type { Category, Client, Project } from "@/lib/types"
import { ProjectThemeColorField } from "@/components/project-theme-color-field"
import { DEFAULT_PROJECT_THEME_COLOR } from "@/components/standup/entry-draft"

type CreateProjectForm = {
  name: string
  clientId: string
  categoryIds: string[]
  themeColor: string
  budgetNpr: string
  startDate: string
  endDate: string
  isVatApplicable: boolean
}

function emptyForm(clientId = ""): CreateProjectForm {
  return {
    name: "",
    clientId,
    categoryIds: [],
    themeColor: DEFAULT_PROJECT_THEME_COLOR,
    budgetNpr: "",
    startDate: new Date().toISOString().slice(0, 10),
    endDate: "",
    isVatApplicable: true,
  }
}

export function CreateProjectDialog({
  open,
  onOpenChange,
  onCreated,
  defaultClientId,
  defaultClientName,
  lockClient = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: (project: Project) => void | Promise<void>
  /** Pre-select this client when the dialog opens. */
  defaultClientId?: string
  /** Display name when client picker is locked. */
  defaultClientName?: string
  /** Hide the client picker and force `defaultClientId`. */
  lockClient?: boolean
}) {
  const [clients, setClients] = React.useState<Client[]>([])
  const [categories, setCategories] = React.useState<Category[]>([])
  const [loadingOptions, setLoadingOptions] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [form, setForm] = React.useState<CreateProjectForm>(() =>
    emptyForm(defaultClientId ?? ""),
  )

  React.useEffect(() => {
    if (!open) return
    setForm(emptyForm(defaultClientId ?? ""))
    let cancelled = false
    setLoadingOptions(true)
    void (async () => {
      try {
        const [clientsRes, categoriesRes] = await Promise.all([
          lockClient && defaultClientId
            ? Promise.resolve(null)
            : api<Envelope<Client[]>>("/clients"),
          api<Envelope<Category[]>>("/categories"),
        ])
        if (cancelled) return
        if (clientsRes) setClients(clientsRes.data)
        setCategories(categoriesRes.data.filter((c) => c.isActive))
      } catch (e) {
        if (!cancelled) {
          alert(e instanceof ApiError ? e.message : "Failed to load form options")
          onOpenChange(false)
        }
      } finally {
        if (!cancelled) setLoadingOptions(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, defaultClientId, lockClient, onOpenChange])

  const activeClients = clients.filter((c) => c.status === "active")
  const lockedClientName =
    defaultClientName ??
    clients.find((c) => c.id === defaultClientId)?.name ??
    "This client"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create project</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault()
            if (form.categoryIds.length === 0) {
              alert("Select at least one category")
              return
            }
            const clientId = lockClient
              ? (defaultClientId ?? "")
              : form.clientId
            if (!clientId) {
              alert("Select a client")
              return
            }
            setSaving(true)
            try {
              const res = await api<Envelope<Project>>("/projects", {
                method: "POST",
                body: {
                  name: form.name.trim(),
                  clientId,
                  categoryIds: form.categoryIds,
                  budgetNpr: parseNprInput(form.budgetNpr),
                  startDate: form.startDate,
                  endDate: form.endDate,
                  isVatApplicable: form.isVatApplicable,
                  themeColor: /^#[0-9A-Fa-f]{6}$/i.test(form.themeColor)
                    ? form.themeColor.toUpperCase()
                    : DEFAULT_PROJECT_THEME_COLOR,
                },
              })
              onOpenChange(false)
              await onCreated?.(res.data)
            } catch (err) {
              alert(err instanceof ApiError ? err.message : "Failed")
            } finally {
              setSaving(false)
            }
          }}
        >
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              required
              disabled={loadingOptions || saving}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <ProjectThemeColorField
            disabled={loadingOptions || saving}
            value={form.themeColor}
            onChange={(themeColor) => setForm((f) => ({ ...f, themeColor }))}
          />
          {lockClient ? (
            <div className="space-y-2">
              <Label>Client</Label>
              <Input disabled value={lockedClientName} readOnly />
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Client</Label>
              <Select
                value={form.clientId || null}
                onValueChange={(v) => setForm((f) => ({ ...f, clientId: v ?? "" }))}
                items={Object.fromEntries(activeClients.map((c) => [c.id, c.name]))}
                disabled={loadingOptions || saving}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  {activeClients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label>Categories</Label>
            <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-3">
              {loadingOptions ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : categories.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active categories</p>
              ) : (
                categories.map((c) => {
                  const checked = form.categoryIds.includes(c.id)
                  return (
                    <label key={c.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={checked}
                        disabled={saving}
                        onCheckedChange={(value) => {
                          setForm((f) => ({
                            ...f,
                            categoryIds: value
                              ? [...f.categoryIds, c.id]
                              : f.categoryIds.filter((id) => id !== c.id),
                          }))
                        }}
                      />
                      {c.name}
                    </label>
                  )
                })
              )}
            </div>
            {form.categoryIds.length === 0 ? (
              <p className="text-xs text-destructive">Select at least one category</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label>Budget (NPR)</Label>
            <Input
              required
              disabled={loadingOptions || saving}
              value={form.budgetNpr}
              onChange={(e) => setForm((f) => ({ ...f, budgetNpr: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Start</Label>
              <Input
                type="date"
                required
                disabled={loadingOptions || saving}
                value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>End</Label>
              <Input
                type="date"
                required
                disabled={loadingOptions || saving}
                value={form.endDate}
                onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <Label htmlFor="create-project-vat">VAT applicable</Label>
            <Switch
              id="create-project-vat"
              checked={form.isVatApplicable}
              disabled={loadingOptions || saving}
              onCheckedChange={(checked) =>
                setForm((f) => ({ ...f, isVatApplicable: Boolean(checked) }))
              }
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loadingOptions || saving}>
              {saving ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
