import * as React from "react"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { Button, buttonVariants } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { PageHeader } from "@/components/page-header"
import { ErrorState, LoadingState } from "@/components/ui-states"
import { api, ApiError, type Envelope } from "@/lib/api"
import { DEFAULT_LIST_SEARCH } from "@/lib/list-query"
import type { Client } from "@/lib/types"

export const Route = createFileRoute("/_app/clients/$id_/edit")({
  component: ClientEditPage,
})

function ClientEditPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const [client, setClient] = React.useState<Client | null>(null)
  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [phone, setPhone] = React.useState("")
  const [additionalInfo, setAdditionalInfo] = React.useState("")
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
      setEmail(res.data.email ?? "")
      setPhone(res.data.phone ?? "")
      setAdditionalInfo(res.data.additionalInfo ?? res.data.contactInfo ?? "")
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

  return (
    <div>
      <PageHeader
        title={`Edit ${client.name}`}
        description="Update client details"
        breadcrumbs={[
          { label: "Clients", to: "/clients", search: DEFAULT_LIST_SEARCH },
          { label: client.name, to: "/clients/$id", params: { id } },
          { label: "Edit" },
        ]}
      />

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="text-base">Client</CardTitle>
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
                  body: {
                    name: name.trim(),
                    email: email.trim() || null,
                    phone: phone.trim() || null,
                    additionalInfo: additionalInfo.trim() || null,
                  },
                })
                void navigate({ to: "/clients/$id", params: { id } })
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
              <Label htmlFor="email">Email (optional)</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone (optional)</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact">Additional info (optional)</Label>
              <Textarea
                id="contact"
                value={additionalInfo}
                onChange={(e) => setAdditionalInfo(e.target.value)}
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Link
                to="/clients/$id"
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
    </div>
  )
}
