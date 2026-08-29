import * as React from "react"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { IconDotsVertical, IconEye, IconPencil, IconTrash } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/health-badge"
import { useConfirmDialog } from "@/components/confirm-dialog"
import {
  NavigableTableRow,
  TableActionLink,
  TableActionsCell,
  TableActionsHead,
} from "@/components/table-row-actions"
import { ErrorState, LoadingState } from "@/components/ui-states"
import { api, ApiError, type Envelope } from "@/lib/api"
import { formatNpr } from "@/lib/money"
import type { Category, Project } from "@/lib/types"

export const Route = createFileRoute("/_app/categories/$id")({
  component: CategoryDetailPage,
})

function CategoryDetailPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const { confirm, dialog } = useConfirmDialog()
  const [category, setCategory] = React.useState<Category | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api<Envelope<Category>>(`/categories/${id}`)
      setCategory(res.data)
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

  const projects = category.projects ?? []
  const projectCount =
    category._count?.projectCategories ?? projects.length
  const canDelete = !category.isSeeded && projectCount === 0
  const deleteBlockedReason = category.isSeeded
    ? "Cannot delete: seeded category"
    : "Cannot delete: category has projects"

  return (
    <div>
      <PageHeader
        title={category.name}
        description="Category detail"
        breadcrumbs={[
          { label: "Categories", to: "/categories" },
          { label: category.name },
        ]}
        status={
          <StatusBadge status={category.isActive ? "active" : "inactive"} />
        }
        actions={
          <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Category actions"
                  />
                }
              >
                <IconDotsVertical />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-40">
                <DropdownMenuGroup>
                  {canDelete ? (
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={async () => {
                        const ok = await confirm({
                          title: "Delete category?",
                          description: "This permanently deletes the category.",
                          confirmLabel: "Delete",
                          destructive: true,
                        })
                        if (!ok) return
                        try {
                          await api(`/categories/${id}`, { method: "DELETE" })
                          void navigate({ to: "/categories" })
                        } catch (e) {
                          alert(
                            e instanceof ApiError ? e.message : "Delete failed",
                          )
                        }
                      }}
                    >
                      <IconTrash />
                      Delete
                    </DropdownMenuItem>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger
                        render={<div className="w-full cursor-not-allowed" />}
                      >
                        <DropdownMenuItem disabled variant="destructive">
                          <IconTrash />
                          Delete
                        </DropdownMenuItem>
                      </TooltipTrigger>
                      <TooltipContent>{deleteBlockedReason}</TooltipContent>
                    </Tooltip>
                  )}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <section className="min-w-0">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Projects{" "}
                <span className="font-normal text-muted-foreground">
                  ({projects.length})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {projects.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No projects in this category.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Budget</TableHead>
                        <TableHead>Timeline</TableHead>
                        <TableActionsHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {projects.map((project) => (
                        <ProjectRow key={project.id} project={project} />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <aside className="lg:sticky lg:top-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">Category details</CardTitle>
              <TableActionLink
                label="Edit details"
                to="/categories/$id/edit"
                params={{ id }}
              >
                <IconPencil className="size-3.5" />
              </TableActionLink>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <Detail label="Name" value={category.name} />
              <Detail
                label="Type"
                value={category.isSeeded ? "Seeded" : "Custom"}
              />
              <Detail label="Projects" value={String(projectCount)} />
            </CardContent>
          </Card>
        </aside>
      </div>
      {dialog}
    </div>
  )
}

function ProjectRow({ project }: { project: Project }) {
  return (
    <NavigableTableRow to="/projects/$id" params={{ id: project.id }}>
      <TableCell>
        <Link
          to="/projects/$id"
          params={{ id: project.id }}
          className="font-medium hover:underline"
          onClick={(event) => event.stopPropagation()}
        >
          {project.name}
        </Link>
      </TableCell>
      <TableCell>
        {project.client ? (
          <Link
            to="/clients/$id"
            params={{ id: project.client.id }}
            className="hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            {project.client.name}
          </Link>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell>
        <StatusBadge status={project.status} />
      </TableCell>
      <TableCell>{formatNpr(project.budgetPaisa)}</TableCell>
      <TableCell className="text-muted-foreground">
        {String(project.startDate).slice(0, 10)} →{" "}
        {project.endDate
          ? String(project.endDate).slice(0, 10)
          : "Ongoing"}
      </TableCell>
      <TableActionsCell>
        <TableActionLink
          label="View"
          to="/projects/$id"
          params={{ id: project.id }}
        >
          <IconEye className="size-3.5" />
        </TableActionLink>
      </TableActionsCell>
    </NavigableTableRow>
  )
}

function Detail({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium">{value}</dd>
    </div>
  )
}
