import * as React from "react"
import { Link, createFileRoute } from "@tanstack/react-router"
import { IconEye, IconPencil } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/health-badge"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui-states"
import {
  NavigableTableRow,
  TableActionLink,
  TableActionsCell,
  TableActionsHead,
} from "@/components/table-row-actions"
import { api, ApiError, type Envelope } from "@/lib/api"
import type { Category } from "@/lib/types"

export const Route = createFileRoute("/_app/categories/")({
  component: CategoriesPage,
})

function CategoriesPage() {
  const [items, setItems] = React.useState<Category[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api<Envelope<Category[]>>("/categories")
      setItems(res.data)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load categories")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  return (
    <div>
      <PageHeader
        title="Categories"
        description="Project categories"
        actions={<Button onClick={() => setOpen(true)}>New category</Button>}
      />
      {loading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!loading && items.length === 0 ? <EmptyState message="No categories" /> : null}
      {items.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Projects</TableHead>
                <TableActionsHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((c) => (
                <NavigableTableRow
                  key={c.id}
                  to="/categories/$id"
                  params={{ id: c.id }}
                >
                  <TableCell>
                    <Link
                      to="/categories/$id"
                      params={{ id: c.id }}
                      className="font-medium hover:underline"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {c.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={c.isActive ? "active" : "inactive"} />
                  </TableCell>
                  <TableCell>{c._count?.projectCategories ?? "—"}</TableCell>
                  <TableActionsCell>
                    <TableActionLink
                      label="View"
                      to="/categories/$id"
                      params={{ id: c.id }}
                    >
                      <IconEye className="size-3.5" />
                    </TableActionLink>
                    <TableActionLink
                      label="Edit"
                      to="/categories/$id/edit"
                      params={{ id: c.id }}
                    >
                      <IconPencil className="size-3.5" />
                    </TableActionLink>
                  </TableActionsCell>
                </NavigableTableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create category</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault()
              try {
                await api("/categories", { method: "POST", body: { name: name.trim() } })
                setOpen(false)
                setName("")
                await load()
              } catch (err) {
                alert(err instanceof ApiError ? err.message : "Failed")
              }
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="cat-name">Name</Label>
              <Input
                id="cat-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Create</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
