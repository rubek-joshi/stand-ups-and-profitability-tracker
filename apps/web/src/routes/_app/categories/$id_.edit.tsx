import * as React from "react"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { Button, buttonVariants } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { PageHeader } from "@/components/page-header"
import { ErrorState, LoadingState } from "@/components/ui-states"
import { api, ApiError, type Envelope } from "@/lib/api"
import type { Category } from "@/lib/types"

export const Route = createFileRoute("/_app/categories/$id_/edit")({
  component: CategoryEditPage,
})

function CategoryEditPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const [category, setCategory] = React.useState<Category | null>(null)
  const [name, setName] = React.useState("")
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api<Envelope<Category>>(`/categories/${id}`)
      setCategory(res.data)
      setName(res.data.name)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load category")
    } finally {
      setLoading(false)
    }
  }, [id])

  React.useEffect(() => {
    void load()
  }, [load])

  if (loading) return <LoadingState />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (!category) return null

  const nameLocked = Boolean(category.isSeeded)

  return (
    <div>
      <PageHeader
        title={`Edit ${category.name}`}
        description="Update category details"
        breadcrumbs={[
          { label: "Categories", to: "/categories" },
          { label: category.name, to: "/categories/$id", params: { id } },
          { label: "Edit" },
        ]}
        actions={
          <Link
            to="/categories/$id"
            params={{ id }}
            className={buttonVariants({ variant: "outline" })}
          >
            Cancel
          </Link>
        }
      />

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="text-base">Category</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault()
              if (nameLocked) return
              setSaving(true)
              try {
                await api(`/categories/${id}`, {
                  method: "PATCH",
                  body: { name: name.trim() },
                })
                void navigate({ to: "/categories/$id", params: { id } })
              } catch (err) {
                alert(err instanceof ApiError ? err.message : "Failed to save")
              } finally {
                setSaving(false)
              }
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="category-name">Name</Label>
              <Input
                id="category-name"
                required
                disabled={nameLocked}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              {nameLocked ? (
                <p className="text-xs text-muted-foreground">
                  Seeded category names cannot be renamed.
                </p>
              ) : null}
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  void navigate({ to: "/categories/$id", params: { id } })
                }
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving || nameLocked}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
