import * as React from "react"
import { createFileRoute } from "@tanstack/react-router"
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
import { useConfirmDialog } from "@/components/confirm-dialog"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui-states"
import { api, ApiError, type Envelope } from "@/lib/api"
import type { Category } from "@/lib/types"

export const Route = createFileRoute("/_app/categories")({
  component: CategoriesPage,
})

function CategoriesPage() {
  const [items, setItems] = React.useState<Category[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [editId, setEditId] = React.useState<string | null>(null)
  const [editName, setEditName] = React.useState("")
  const { confirm, dialog } = useConfirmDialog()

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
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    {editId === c.id ? (
                      <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                    ) : (
                      c.name
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={c.isActive ? "active" : "inactive"} />
                  </TableCell>
                  <TableCell className="space-x-2 text-right">
                    {editId === c.id ? (
                      <>
                        <Button
                          size="sm"
                          onClick={async () => {
                            await api(`/categories/${c.id}`, {
                              method: "PATCH",
                              body: { name: editName.trim() },
                            })
                            setEditId(null)
                            await load()
                          }}
                        >
                          Save
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditId(null)}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditId(c.id)
                            setEditName(c.name)
                          }}
                        >
                          Edit
                        </Button>
                        {c.isActive ? (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={async () => {
                              const ok = await confirm({
                                title: "Deactivate category?",
                                description: `"${c.name}" will be marked inactive.`,
                                confirmLabel: "Deactivate",
                                destructive: true,
                              })
                              if (!ok) return
                              await api(`/categories/${c.id}/deactivate`, { method: "POST" })
                              await load()
                            }}
                          >
                            Deactivate
                          </Button>
                        ) : null}
                      </>
                    )}
                  </TableCell>
                </TableRow>
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
      {dialog}
    </div>
  )
}
