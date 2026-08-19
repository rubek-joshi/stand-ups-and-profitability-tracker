import * as React from "react"
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Label } from "@workspace/ui/components/label"
import { ApiError, getToken } from "@/lib/api"
import { homePathForRole } from "@/lib/access"
import { useAuth } from "@/lib/auth"
import { PasswordInput } from "@/components/password-input"
import { LoadingState } from "@/components/ui-states"

export const Route = createFileRoute("/change-password")({
  ssr: false,
  beforeLoad: () => {
    if (typeof window !== "undefined" && !getToken()) {
      throw redirect({ to: "/login" })
    }
  },
  component: ChangePasswordPage,
})

function ChangePasswordPage() {
  const { user, loading, changePassword, logout, refreshUser } = useAuth()
  const navigate = useNavigate()
  const [currentPassword, setCurrentPassword] = React.useState("")
  const [newPassword, setNewPassword] = React.useState("")
  const [confirmPassword, setConfirmPassword] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (loading) return
    if (!user) {
      void navigate({ to: "/login" })
      return
    }
    if (!user.mustChangePassword) {
      void navigate({ to: "/" })
    }
  }, [loading, user, navigate])

  if (loading || !user) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <LoadingState label="Checking session…" />
      </div>
    )
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>
            Your account requires a new password before you can continue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault()
              setError(null)
              if (newPassword !== confirmPassword) {
                setError("New passwords do not match")
                return
              }
              setSaving(true)
              try {
                await changePassword(currentPassword, newPassword)
                await refreshUser()
                void navigate({ to: homePathForRole(user.role) })
              } catch (err) {
                setError(
                  err instanceof ApiError ? err.message : "Failed to change password",
                )
              } finally {
                setSaving(false)
              }
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="current-password">Current password</Label>
              <PasswordInput
                id="current-password"
                autoComplete="current-password"
                required
                minLength={8}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-password">New password</Label>
              <PasswordInput
                id="new-password"
                autoComplete="new-password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <PasswordInput
                id="confirm-password"
                autoComplete="new-password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? "Saving…" : "Update password"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                logout()
                void navigate({ to: "/login" })
              }}
            >
              Sign out
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
