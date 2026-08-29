import * as React from "react"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { Button, buttonVariants } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { PageHeader } from "@/components/page-header"
import { ErrorState, LoadingState } from "@/components/ui-states"
import { api, ApiError, type Envelope } from "@/lib/api"
import { DEFAULT_LIST_SEARCH } from "@/lib/list-query"
import { parseNprInput, paisaToNpr } from "@/lib/money"
import type { Category, Project } from "@/lib/types"
import { Switch } from "@workspace/ui/components/switch"
import { ProjectThemeColorField } from "@/components/project-theme-color-field"
import { DEFAULT_PROJECT_THEME_COLOR } from "@/components/standup/entry-draft"

export const Route = createFileRoute("/_app/projects/$id_/edit")({
  component: ProjectEditPage,
})

function ProjectEditPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
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

  if (loading) return <LoadingState />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (!project) return null

  return (
    <div>
      <PageHeader
        title={`Edit ${project.name}`}
        description="Update project details"
        breadcrumbs={[
          { label: "Projects", to: "/projects", search: DEFAULT_LIST_SEARCH },
          { label: project.name, to: "/projects/$id", params: { id } },
          { label: "Edit" },
        ]}
        actions={
          <Link
            to="/projects/$id"
            params={{ id }}
            className={buttonVariants({ variant: "outline" })}
          >
            Cancel
          </Link>
        }
      />

      <Card className="max-w-xl">
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
            <Button type="submit" disabled={saving} className="w-fit">
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
