import * as React from "react"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/health-badge"
import { useConfirmDialog } from "@/components/confirm-dialog"
import { ErrorState, LoadingState } from "@/components/ui-states"
import { api, ApiError, type Envelope } from "@/lib/api"
import type { Client } from "@/lib/types"

export const Route = createFileRoute("/_app/clients/$id")({
  component: ClientDetailPage,
})

function ClientDetailPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const { confirm, dialog } = useConfirmDialog()
  const [client, setClient] = React.useState<Client | null>(null)
  const [name, setName] = React.useState("")
  const [contactInfo, setContactInfo] = React.useState("")
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api<Envelope<Client>>(`/clients/${id}`)
      setClient(res.data)
      setName(res.data.name)
      setContactInfo(res.data.contactInfo ?? "")
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load client")
    } finally {
      setLoading(false)
    }
  }, [id])

  React.useEffect(() => {
    void load()
  }, [load])

  if (loading) return <LoadingState />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (!client) return null

  const canDelete = (client._count?.projects ?? client.projects?.length ?? 0) === 0

  return (
    <div>
      <PageHeader
        title={client.name}
        description="Client detail"
        actions={
          <>
            <StatusBadge status={client.status} />
            {client.status === "active" ? (
              <Button
                variant="outline"
                onClick={async () => {
                  const ok = await confirm({
                    title: "Deactivate client?",
                    description: "The client will be marked inactive.",
                    confirmLabel: "Deactivate",
                    destructive: true,
                  })
                  if (!ok) return
                  await api(`/clients/${id}/deactivate`, { method: "POST" })
                  await load()
                }}
              >
                Deactivate
              </Button>
            ) : null}
            <Button
              variant="destructive"
              disabled={!canDelete}
              title={canDelete ? undefined : "Cannot delete: client has projects"}
              onClick={async () => {
                const ok = await confirm({
                  title: "Delete client?",
                  description: "This permanently deletes the client.",
                  confirmLabel: "Delete",
                  destructive: true,
                })
                if (!ok) return
                try {
                  await api(`/clients/${id}`, { method: "DELETE" })
                  void navigate({ to: "/clients" })
                } catch (e) {
                  alert(e instanceof ApiError ? e.message : "Delete failed")
                }
              }}
            >
              Delete
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Edit</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault()
                setSaving(true)
                try {
                  await api(`/clients/${id}`, {
                    method: "PATCH",
                    body: { name: name.trim(), contactInfo: contactInfo.trim() || null },
                  })
                  await load()
                } catch (err) {
                  alert(err instanceof ApiError ? err.message : "Save failed")
                } finally {
                  setSaving(false)
                }
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact">Contact info</Label>
                <Textarea
                  id="contact"
                  value={contactInfo}
                  onChange={(e) => setContactInfo(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Projects</CardTitle>
          </CardHeader>
          <CardContent>
            {(client.projects ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No projects</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {client.projects!.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2">
                    <Link to="/projects/$id" params={{ id: p.id }} className="hover:underline">
                      {p.name}
                    </Link>
                    <StatusBadge status={p.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      {dialog}
    </div>
  )
}
