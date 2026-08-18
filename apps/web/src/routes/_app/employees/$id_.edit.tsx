import * as React from "react"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { Button, buttonVariants } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { PageHeader } from "@/components/page-header"
import { ErrorState, LoadingState } from "@/components/ui-states"
import { api, ApiError, type Envelope } from "@/lib/api"
import { DEFAULT_LIST_SEARCH } from "@/lib/list-query"
import type { Employee } from "@/lib/types"

export const Route = createFileRoute("/_app/employees/$id_/edit")({
  component: EmployeeEditPage,
})

function EmployeeEditPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const [employee, setEmployee] = React.useState<Employee | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [contactNumber, setContactNumber] = React.useState("")
  const [dateJoined, setDateJoined] = React.useState("")
  const [dateOfBirth, setDateOfBirth] = React.useState("")

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api<Envelope<Employee>>(`/employees/${id}`)
      setEmployee(res.data)
      setName(res.data.name)
      setEmail(res.data.email)
      setContactNumber(res.data.contactNumber ?? "")
      setDateJoined(String(res.data.dateJoined).slice(0, 10))
      setDateOfBirth(
        res.data.dateOfBirth ? String(res.data.dateOfBirth).slice(0, 10) : "",
      )
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
  if (!employee) return null

  return (
    <div>
      <PageHeader
        title={`Edit ${employee.name}`}
        description="Update employee profile"
        breadcrumbs={[
          { label: "Employees", to: "/employees", search: DEFAULT_LIST_SEARCH },
          { label: employee.name, to: "/employees/$id", params: { id } },
          { label: "Edit details" },
        ]}
        actions={
          <Link
            to="/employees/$id"
            params={{ id }}
            className={buttonVariants({ variant: "secondary" })}
          >
            Cancel
          </Link>
        }
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
              const today = new Date().toISOString().slice(0, 10)
              if (dateOfBirth && dateOfBirth > today) {
                alert("Date of birth cannot be in the future")
                return
              }
              setSaving(true)
              try {
                await api(`/employees/${id}`, {
                  method: "PATCH",
                  body: {
                    name: name.trim(),
                    email: email.trim(),
                    contactNumber: contactNumber.trim() || null,
                    dateJoined,
                    dateOfBirth: dateOfBirth || null,
                  },
                })
                void navigate({ to: "/employees/$id", params: { id } })
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
              <Label>Date joined</Label>
              <Input
                type="date"
                required
                value={dateJoined}
                onChange={(e) => setDateJoined(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Date of birth (optional)</Label>
              <Input
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save profile"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
