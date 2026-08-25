import * as React from "react"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { Button, buttonVariants } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { PageHeader } from "@/components/page-header"
import { ErrorState, LoadingState } from "@/components/ui-states"
import { api, ApiError, type Envelope } from "@/lib/api"
import type { CoreMember } from "@/lib/types"

export const Route = createFileRoute("/_app/core-members/$id_/edit")({
  component: CoreMemberEditPage,
})

function CoreMemberEditPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const [member, setMember] = React.useState<CoreMember | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [contactNumber, setContactNumber] = React.useState("")
  const [panNumber, setPanNumber] = React.useState("")
  const [dateJoined, setDateJoined] = React.useState("")

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api<Envelope<CoreMember>>(`/core-members/${id}`)
      setMember(res.data)
      setName(res.data.name)
      setEmail(res.data.email)
      setContactNumber(res.data.contactNumber ?? "")
      setPanNumber(res.data.panNumber ?? "")
      setDateJoined(String(res.data.dateJoined).slice(0, 10))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load")
    } finally {
      setLoading(false)
    }
  }, [id])

  React.useEffect(() => {
    void load()
  }, [load])

  if (loading) return <LoadingState />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (!member) return null

  return (
    <div>
      <PageHeader
        title={`Edit ${member.name}`}
        description="Update core member profile"
        breadcrumbs={[
          { label: "Core Members", to: "/core-members" },
          { label: member.name, to: "/core-members/$id", params: { id } },
          { label: "Edit details" },
        ]}
      />

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault()
              setSaving(true)
              try {
                await api(`/core-members/${id}`, {
                  method: "PATCH",
                  body: {
                    name: name.trim(),
                    email: email.trim(),
                    contactNumber: contactNumber.trim() || null,
                    panNumber: panNumber.trim() || null,
                    dateJoined,
                  },
                })
                void navigate({ to: "/core-members/$id", params: { id } })
              } catch (err) {
                alert(err instanceof ApiError ? err.message : "Save failed")
              } finally {
                setSaving(false)
              }
            }}
          >
            <div className="space-y-2">
              <Label>Name</Label>
              <Input required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Contact number (optional)</Label>
              <Input
                type="tel"
                value={contactNumber}
                onChange={(e) => setContactNumber(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>PAN number (optional)</Label>
              <Input
                value={panNumber}
                maxLength={20}
                onChange={(e) => setPanNumber(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Date joined</Label>
              <Input
                type="date"
                required
                value={dateJoined}
                onChange={(e) => setDateJoined(e.target.value)}
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Link
                to="/core-members/$id"
                params={{ id }}
                className={buttonVariants({ variant: "secondary" })}
              >
                Cancel
              </Link>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save profile"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
