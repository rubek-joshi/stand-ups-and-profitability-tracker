import * as React from "react"
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { browserSupportsWebAuthn } from "@simplewebauthn/browser"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Separator } from "@workspace/ui/components/separator"
import { getToken } from "@/lib/api"
import { homePathForRole } from "@/lib/access"
import { useAuth } from "@/lib/auth"
import { ApiError } from "@/lib/api"
import { webAuthnErrorMessage } from "@/lib/webauthn"
import { PasswordInput } from "@/components/password-input"

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
  const { login, loginWithPasskey } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [passkeyLoading, setPasskeyLoading] = React.useState(false)
  const [passkeysSupported, setPasskeysSupported] = React.useState(false)

  React.useEffect(() => {
    setPasskeysSupported(browserSupportsWebAuthn())
  }, [])

  async function afterLogin(user: Awaited<ReturnType<typeof login>>) {
    void navigate({
      to: user.mustChangePassword ? "/change-password" : homePathForRole(user.role),
    })
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Tracker</CardTitle>
          <CardDescription>Sign in with your account.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={async (e) => {
              e.preventDefault()
              setError(null)
              setLoading(true)
              try {
                const user = await login(email.trim(), password)
                await afterLogin(user)
              } catch (err) {
                setError(err instanceof ApiError ? err.message : "Login failed")
              } finally {
                setLoading(false)
              }
            }}
          >
            <div className="flex flex-col gap-2">
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
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <PasswordInput
                id="password"
                autoComplete="current-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={loading || passkeyLoading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          {passkeysSupported ? (
            <div className="mt-4 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <Separator className="flex-1" />
                <span className="text-xs text-muted-foreground">or</span>
                <Separator className="flex-1" />
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={loading || passkeyLoading}
                onClick={async () => {
                  setError(null)
                  setPasskeyLoading(true)
                  try {
                    const user = await loginWithPasskey(email.trim() || undefined)
                    await afterLogin(user)
                  } catch (err) {
                    setError(webAuthnErrorMessage(err, "Passkey sign-in failed"))
                  } finally {
                    setPasskeyLoading(false)
                  }
                }}
              >
                {passkeyLoading ? "Waiting for passkey…" : "Sign in with a passkey"}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
