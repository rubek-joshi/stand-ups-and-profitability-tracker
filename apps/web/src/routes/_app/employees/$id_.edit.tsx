import * as React from "react"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { IconPencil, IconPlus, IconTrash } from "@tabler/icons-react"
import { Button, buttonVariants } from "@workspace/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { useConfirmDialog } from "@/components/confirm-dialog"
import { TelLink } from "@/components/contact-link"
import { DateInput } from "@/components/datetime-picker"
import { PageHeader } from "@/components/page-header"
import { TableActionButton } from "@/components/table-row-actions"
import { ErrorState, LoadingState } from "@/components/ui-states"
import { api, ApiError, type Envelope } from "@/lib/api"
import { DEFAULT_LIST_SEARCH } from "@/lib/list-query"
import type { Employee, EmployeeEmergencyContact } from "@/lib/types"

export const Route = createFileRoute("/_app/employees/$id_/edit")({
  component: EmployeeEditPage,
})

type EmergencyContactForm = {
  fullName: string
  phoneNumber: string
}

const emptyEmergencyContactForm = (): EmergencyContactForm => ({
  fullName: "",
  phoneNumber: "",
})

function EmployeeEditPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const { confirm, dialog } = useConfirmDialog()

  const [employee, setEmployee] = React.useState<Employee | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [contactNumber, setContactNumber] = React.useState("")
  const [panNumber, setPanNumber] = React.useState("")
  const [dateJoined, setDateJoined] = React.useState("")
  const [dateOfBirth, setDateOfBirth] = React.useState("")

  const [emergencyContactOpen, setEmergencyContactOpen] = React.useState(false)
  const [editingEmergencyContact, setEditingEmergencyContact] =
    React.useState<EmployeeEmergencyContact | null>(null)
  const [emergencyContactForm, setEmergencyContactForm] =
    React.useState<EmergencyContactForm>(emptyEmergencyContactForm)
  const [savingEmergencyContact, setSavingEmergencyContact] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api<Envelope<Employee>>(`/employees/${id}`)
      setEmployee(res.data)
      setName(res.data.name)
      setEmail(res.data.email)
      setContactNumber(res.data.contactNumber ?? "")
      setPanNumber(res.data.panNumber ?? "")
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

  const openCreateEmergencyContact = () => {
    setEditingEmergencyContact(null)
    setEmergencyContactForm(emptyEmergencyContactForm())
    setEmergencyContactOpen(true)
  }

  const openEditEmergencyContact = (contact: EmployeeEmergencyContact) => {
    setEditingEmergencyContact(contact)
    setEmergencyContactForm({
      fullName: contact.fullName,
      phoneNumber: contact.phoneNumber,
    })
    setEmergencyContactOpen(true)
  }

  if (loading) return <LoadingState />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (!employee) return null

  const emergencyContacts = employee.emergencyContacts ?? []

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Edit ${employee.name}`}
        description="Update employee profile"
        breadcrumbs={[
          { label: "Employees", to: "/employees", search: DEFAULT_LIST_SEARCH },
          { label: employee.name, to: "/employees/$id", params: { id } },
          { label: "Edit details" },
        ]}
      />

      <div className="grid max-w-4xl gap-6 lg:grid-cols-2 lg:items-start">
        <Card>
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
                      panNumber: panNumber.trim() || null,
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
                <Label>PAN number (optional)</Label>
                <Input
                  value={panNumber}
                  maxLength={20}
                  onChange={(e) => setPanNumber(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Date joined</Label>
                <DateInput
                  value={dateJoined}
                  onChange={(next) => setDateJoined(next ?? "")}
                />
              </div>
              <div className="space-y-2">
                <Label>Date of birth (optional)</Label>
                <DateInput
                  clearable
                  max={new Date().toISOString().slice(0, 10)}
                  value={dateOfBirth}
                  onChange={(next) => setDateOfBirth(next ?? "")}
                />
              </div>
              <div className="flex gap-2 pt-1">
                <Link
                  to="/employees/$id"
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

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base">Emergency contacts</CardTitle>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={openCreateEmergencyContact}
            >
              <IconPlus className="size-3.5 mr-1" />
              Add contact
            </Button>
          </CardHeader>
          <CardContent>
            {emergencyContacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No emergency contacts recorded yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {emergencyContacts.map((contact) => (
                  <li
                    key={contact.id}
                    className="flex items-start justify-between gap-2 rounded-md border p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{contact.fullName}</p>
                      <TelLink value={contact.phoneNumber} withCopy="hover" />
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <TableActionButton
                        label="Edit emergency contact"
                        onClick={() => openEditEmergencyContact(contact)}
                      >
                        <IconPencil className="size-3.5" />
                      </TableActionButton>
                      <TableActionButton
                        label="Delete emergency contact"
                        variant="destructive"
                        onClick={async () => {
                          const ok = await confirm({
                            title: "Delete emergency contact?",
                            description: `${contact.fullName} will be removed from this employee.`,
                            confirmLabel: "Delete",
                            destructive: true,
                          })
                          if (!ok) return
                          try {
                            await api(
                              `/employees/${id}/emergency-contacts/${contact.id}`,
                              { method: "DELETE" },
                            )
                            await load()
                          } catch (err) {
                            alert(
                              err instanceof ApiError
                                ? err.message
                                : "Failed to delete emergency contact",
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
        open={emergencyContactOpen}
        onOpenChange={(open) => {
          setEmergencyContactOpen(open)
          if (!open) setEditingEmergencyContact(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingEmergencyContact
                ? "Edit emergency contact"
                : "Add emergency contact"}
            </DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={async (event) => {
              event.preventDefault()
              setSavingEmergencyContact(true)
              const body = {
                fullName: emergencyContactForm.fullName.trim(),
                phoneNumber: emergencyContactForm.phoneNumber.trim(),
              }
              try {
                if (editingEmergencyContact) {
                  await api(
                    `/employees/${id}/emergency-contacts/${editingEmergencyContact.id}`,
                    { method: "PATCH", body },
                  )
                } else {
                  await api(`/employees/${id}/emergency-contacts`, {
                    method: "POST",
                    body,
                  })
                }
                setEmergencyContactOpen(false)
                setEditingEmergencyContact(null)
                await load()
              } catch (caughtError) {
                alert(
                  caughtError instanceof ApiError
                    ? caughtError.message
                    : "Failed to save emergency contact",
                )
              } finally {
                setSavingEmergencyContact(false)
              }
            }}
          >
            <div className="space-y-2">
              <Label>Full name</Label>
              <Input
                required
                maxLength={200}
                value={emergencyContactForm.fullName}
                onChange={(event) =>
                  setEmergencyContactForm((form) => ({
                    ...form,
                    fullName: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Phone number</Label>
              <Input
                type="tel"
                required
                maxLength={40}
                value={emergencyContactForm.phoneNumber}
                onChange={(event) =>
                  setEmergencyContactForm((form) => ({
                    ...form,
                    phoneNumber: event.target.value,
                  }))
                }
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEmergencyContactOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={savingEmergencyContact}>
                {savingEmergencyContact
                  ? "Saving…"
                  : editingEmergencyContact
                    ? "Save contact"
                    : "Add contact"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
