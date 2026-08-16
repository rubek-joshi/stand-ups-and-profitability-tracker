import * as React from "react"
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { getToken } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { ApiError } from "@/lib/api"

export const Route = createFileRoute("/login")({
  ssr: false,
  beforeLoad: () => {
    if (typeof window !== "undefined" && getToken()) {
      throw redirect({ to: "/" })
    }
  },
  component: LoginPage,
})

function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Tracker</CardTitle>
          <CardDescription>Sign in with your admin account.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault()
              setError(null)
              setLoading(true)
              try {
                const user = await login(email.trim(), password)
                void navigate({
                  to: user.mustChangePassword ? "/change-password" : "/",
                })
              } catch (err) {
                setError(err instanceof ApiError ? err.message : "Login failed")
              } finally {
                setLoading(false)
              }
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
