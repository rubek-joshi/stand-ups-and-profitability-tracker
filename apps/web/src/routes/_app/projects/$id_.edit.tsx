import * as React from "react"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { IconPencil, IconPlus, IconTrash } from "@tabler/icons-react"
import { Button, buttonVariants } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Switch } from "@workspace/ui/components/switch"
import { useConfirmDialog } from "@/components/confirm-dialog"
import { PageHeader } from "@/components/page-header"
import { ProjectThemeColorField } from "@/components/project-theme-color-field"
import { DEFAULT_PROJECT_THEME_COLOR } from "@/components/standup/entry-draft"
import { TableActionButton } from "@/components/table-row-actions"
import { ErrorState, LoadingState } from "@/components/ui-states"
import { api, ApiError, type Envelope } from "@/lib/api"
import { DEFAULT_LIST_SEARCH } from "@/lib/list-query"
import { parseNprInput, paisaToNpr } from "@/lib/money"
import type { Category, Project, ProjectLink } from "@/lib/types"

export const Route = createFileRoute("/_app/projects/$id_/edit")({
  component: ProjectEditPage,
})

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
  } catch {
    return false
  }
}

function ProjectEditPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const { confirm, dialog } = useConfirmDialog()

  const [project, setProject] = React.useState<Project | null>(null)
  const [categories, setCategories] = React.useState<Category[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [edit, setEdit] = React.useState({
    name: "",
    categoryIds: [] as string[],
    themeColor: DEFAULT_PROJECT_THEME_COLOR,
    budgetNpr: "",
    startDate: "",
    endDate: "",
    isIndefinite: false,
    isVatApplicable: true,
  })

  const [linkOpen, setLinkOpen] = React.useState(false)
  const [editingLink, setEditingLink] = React.useState<ProjectLink | null>(null)
  const [linkForm, setLinkForm] = React.useState({ label: "", url: "" })
  const [savingLink, setSavingLink] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [p, cats] = await Promise.all([
        api<Envelope<Project>>(`/projects/${id}`),
        api<Envelope<Category[]>>("/categories"),
      ])
      setProject(p.data)
      setCategories(cats.data.filter((c) => c.isActive))
      setEdit({
        name: p.data.name,
        categoryIds:
          p.data.categoryIds ?? p.data.categories?.map((c) => c.id) ?? [],
        themeColor: p.data.themeColor || DEFAULT_PROJECT_THEME_COLOR,
        budgetNpr: String(paisaToNpr(p.data.budgetPaisa)),
        startDate: String(p.data.startDate).slice(0, 10),
        endDate: p.data.endDate ? String(p.data.endDate).slice(0, 10) : "",
        isIndefinite: !p.data.endDate,
        isVatApplicable: p.data.isVatApplicable,
      })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load project")
    } finally {
      setLoading(false)
    }
  }, [id])

  React.useEffect(() => {
    void load()
  }, [load])

  const openCreateLink = () => {
    setEditingLink(null)
    setLinkForm({ label: "", url: "" })
    setLinkOpen(true)
  }

  const openEditLink = (link: ProjectLink) => {
    setEditingLink(link)
    setLinkForm({ label: link.label, url: link.url })
    setLinkOpen(true)
  }

  if (loading) return <LoadingState />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (!project) return null

  const links = project.links ?? []

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Edit ${project.name}`}
        description="Update project details"
        breadcrumbs={[
          { label: "Projects", to: "/projects", search: DEFAULT_LIST_SEARCH },
          { label: project.name, to: "/projects/$id", params: { id } },
          { label: "Edit" },
        ]}
      />

      <div className="grid max-w-4xl gap-6 lg:grid-cols-2 lg:items-start">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Project</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-3"
              onSubmit={async (e) => {
                e.preventDefault()
                setSaving(true)
                try {
                  await api(`/projects/${id}`, {
                    method: "PATCH",
                    body: {
                      name: edit.name.trim(),
                      categoryIds: edit.categoryIds,
                      themeColor: /^#[0-9A-Fa-f]{6}$/i.test(edit.themeColor)
                        ? edit.themeColor.toUpperCase()
                        : DEFAULT_PROJECT_THEME_COLOR,
                      budgetNpr: parseNprInput(edit.budgetNpr),
                      startDate: edit.startDate,
                      endDate: edit.isIndefinite ? null : edit.endDate.trim() || null,
                      isVatApplicable: edit.isVatApplicable,
                    },
                  })
                  void navigate({ to: "/projects/$id", params: { id } })
                } catch (err) {
                  alert(err instanceof ApiError ? err.message : "Save failed")
                } finally {
                  setSaving(false)
                }
              }}
            >
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  required
                  value={edit.name}
                  onChange={(e) =>
                    setEdit((f) => ({ ...f, name: e.target.value }))
                  }
                />
              </div>
              <ProjectThemeColorField
                value={edit.themeColor}
                onChange={(themeColor) => setEdit((f) => ({ ...f, themeColor }))}
              />
              <div className="space-y-2">
                <Label>Categories</Label>
                <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-3">
                  {categories.map((c) => {
                    const checked = edit.categoryIds.includes(c.id)
                    return (
                      <label
                        key={c.id}
                        className="flex items-center gap-2 text-sm"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) => {
                            setEdit((f) => ({
                              ...f,
                              categoryIds: value
                                ? [...f.categoryIds, c.id]
                                : f.categoryIds.filter((cid) => cid !== c.id),
                            }))
                          }}
                        />
                        {c.name}
                      </label>
                    )
                  })}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Budget (NPR)</Label>
                <Input
                  required
                  value={edit.budgetNpr}
                  onChange={(e) =>
                    setEdit((f) => ({ ...f, budgetNpr: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                  <Checkbox
                    checked={edit.isIndefinite}
                    onCheckedChange={(checked) =>
                      setEdit((f) => ({ ...f, isIndefinite: Boolean(checked) }))
                    }
                  />
                  Indefinite / Ongoing (no set end date)
                </label>
                <div className={`grid ${edit.isIndefinite ? "grid-cols-1" : "grid-cols-2"} gap-3`}>
                  <div className="space-y-2">
                    <Label>Start</Label>
                    <Input
                      type="date"
                      required
                      value={edit.startDate}
                      onChange={(e) =>
                        setEdit((f) => ({ ...f, startDate: e.target.value }))
                      }
                    />
                  </div>
                  {!edit.isIndefinite ? (
                    <div className="space-y-2">
                      <Label>End</Label>
                      <Input
                        type="date"
                        required
                        value={edit.endDate}
                        onChange={(e) =>
                          setEdit((f) => ({ ...f, endDate: e.target.value }))
                        }
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <Label>VAT applicable</Label>
              <Switch
                checked={edit.isVatApplicable}
                onCheckedChange={(c) =>
                  setEdit((f) => ({ ...f, isVatApplicable: Boolean(c) }))
                }
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Link
                to="/projects/$id"
                params={{ id }}
                className={buttonVariants({ variant: "secondary" })}
              >
                Cancel
              </Link>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base">Project links</CardTitle>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={openCreateLink}
            >
              <IconPlus className="size-3.5 mr-1" />
              Add link
            </Button>
          </CardHeader>
          <CardContent>
            {links.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No project links recorded yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {links.map((link) => (
                  <li
                    key={link.id}
                    className="flex items-start justify-between gap-2 rounded-md border p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{link.label}</p>
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate text-xs text-primary underline-offset-4 hover:underline block"
                      >
                        {link.url}
                      </a>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <TableActionButton
                        label="Edit project link"
                        onClick={() => openEditLink(link)}
                      >
                        <IconPencil className="size-3.5" />
                      </TableActionButton>
                      <TableActionButton
                        label="Delete project link"
                        variant="destructive"
                        onClick={async () => {
                          const ok = await confirm({
                            title: "Delete project link?",
                            description: `${link.label} will be removed from this project.`,
                            confirmLabel: "Delete",
                            destructive: true,
                          })
                          if (!ok) return
                          try {
                            await api(`/projects/${id}/links/${link.id}`, {
                              method: "DELETE",
                            })
                            await load()
                          } catch (err) {
                            alert(
                              err instanceof ApiError
                                ? err.message
                                : "Failed to delete project link",
                            )
                          }
                        }}
                      >
                        <IconTrash className="size-3.5" />
                      </TableActionButton>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {dialog}

      <Dialog
        open={linkOpen}
        onOpenChange={(open) => {
          setLinkOpen(open)
          if (!open) setEditingLink(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingLink ? "Edit project link" : "Add project link"}
            </DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={async (event) => {
              event.preventDefault()
              const label = linkForm.label.trim()
              const url = linkForm.url.trim()
              if (!label) {
                alert("Label is required")
                return
              }
              if (!isHttpUrl(url)) {
                alert("URL must start with http:// or https://")
                return
              }
              setSavingLink(true)
              try {
                const body = { label, url }
                if (editingLink) {
                  await api(`/projects/${id}/links/${editingLink.id}`, {
                    method: "PATCH",
                    body,
                  })
                } else {
                  await api(`/projects/${id}/links`, {
                    method: "POST",
                    body,
                  })
                }
                setLinkOpen(false)
                setEditingLink(null)
                await load()
              } catch (caughtError) {
                alert(
                  caughtError instanceof ApiError
                    ? caughtError.message
                    : "Failed to save project link",
                )
              } finally {
                setSavingLink(false)
              }
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="project-link-label">Label</Label>
              <Input
                id="project-link-label"
                required
                maxLength={200}
                value={linkForm.label}
                onChange={(event) =>
                  setLinkForm((form) => ({
                    ...form,
                    label: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-link-url">URL</Label>
              <Input
                id="project-link-url"
                type="url"
                required
                maxLength={2048}
                placeholder="https://"
                value={linkForm.url}
                onChange={(event) =>
                  setLinkForm((form) => ({
                    ...form,
                    url: event.target.value,
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">
                Must be an http or https URL. Opens in a new tab.
              </p>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={savingLink}
                onClick={() => setLinkOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={savingLink}>
                {savingLink
                  ? "Saving…"
                  : editingLink
                    ? "Save link"
                    : "Add link"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
