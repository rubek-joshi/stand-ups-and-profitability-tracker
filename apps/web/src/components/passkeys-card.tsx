import * as React from "react"
import {
  browserSupportsWebAuthn,
  startRegistration,
} from "@simplewebauthn/browser"
import { IconPencil, IconTrash } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { useConfirmDialog } from "@/components/confirm-dialog"
import { ErrorState, LoadingState } from "@/components/ui-states"
import { api, ApiError, type Envelope } from "@/lib/api"
import { formatLastLogin } from "@/lib/roles"
import type { UserPasskey } from "@/lib/types"
import { webAuthnErrorMessage, deviceHintHeaders } from "@/lib/webauthn"

export function PasskeysCard() {
  const { confirm, dialog } = useConfirmDialog()
  const [passkeys, setPasskeys] = React.useState<UserPasskey[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [adding, setAdding] = React.useState(false)
  const [supported, setSupported] = React.useState(false)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [editName, setEditName] = React.useState("")
  const [savingId, setSavingId] = React.useState<string | null>(null)

  React.useEffect(() => {
    setSupported(browserSupportsWebAuthn())
  }, [])

  const load = React.useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true)
    setError(null)
    try {
      const res = await api<Envelope<UserPasskey[]>>("/auth/passkeys")
      setPasskeys(res.data)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load passkeys")
    } finally {
      if (!opts?.silent) setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  async function addPasskey() {
    setAdding(true)
    setError(null)
    try {
      const optionsRes = await api<
        Envelope<{
          challengeId: string
          options: Parameters<typeof startRegistration>[0]["optionsJSON"]
        }>
      >("/auth/passkeys/register/options", { method: "POST" })
      const credential = await startRegistration({
        optionsJSON: optionsRes.data.options,
      })
      await api("/auth/passkeys/register/verify", {
        method: "POST",
        headers: await deviceHintHeaders(),
        body: { challengeId: optionsRes.data.challengeId, credential },
      })
      await load({ silent: true })
    } catch (e) {
      setError(webAuthnErrorMessage(e, "Failed to add passkey"))
    } finally {
      setAdding(false)
    }
  }

  async function saveName(passkey: UserPasskey) {
    const name = editName.trim()
    if (!name || name === passkey.name) {
      setEditingId(null)
      return
    }
    setSavingId(passkey.id)
    try {
      await api(`/auth/passkeys/${passkey.id}`, {
        method: "PATCH",
        body: { name },
      })
      setEditingId(null)
      await load({ silent: true })
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "Failed to rename passkey")
    } finally {
      setSavingId(null)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <CardTitle className="text-base">Passkeys</CardTitle>
          <CardDescription>
            Sign in with a fingerprint, face, or security key. You can add more than one.
          </CardDescription>
        </div>
        {supported ? (
          <Button type="button" size="sm" disabled={adding} onClick={() => void addPasskey()}>
            {adding ? "Waiting…" : "Add passkey"}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {!supported ? (
          <p className="text-sm text-muted-foreground">
            This browser does not support passkeys.
          </p>
        ) : null}
        {error ? <ErrorState message={error} /> : null}
        {loading ? <LoadingState label="Loading passkeys…" /> : null}
        {!loading && passkeys.length === 0 ? (
          <p className="text-sm text-muted-foreground">No passkeys yet.</p>
        ) : null}
        {!loading && passkeys.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {passkeys.map((passkey) => (
              <li
                key={passkey.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border px-3 py-3"
              >
                <div className="min-w-0 flex-1">
                  {editingId === passkey.id ? (
                    <form
                      className="flex flex-wrap items-center gap-2"
                      onSubmit={(e) => {
                        e.preventDefault()
                        void saveName(passkey)
                      }}
                    >
                      <Input
                        autoFocus
                        required
                        maxLength={80}
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") setEditingId(null)
                        }}
                        className="h-8 max-w-xs"
                      />
                      <Button
                        type="submit"
                        size="sm"
                        disabled={savingId === passkey.id || !editName.trim()}
                      >
                        {savingId === passkey.id ? "Saving…" : "Save"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={savingId === passkey.id}
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </Button>
                    </form>
                  ) : (
                    <div className="flex flex-wrap items-center gap-1">
                      <p className="font-medium">{passkey.name}</p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Rename ${passkey.name}`}
                        onClick={() => {
                          setEditName(passkey.name)
                          setEditingId(passkey.id)
                        }}
                      >
                        <IconPencil />
                      </Button>
                    </div>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Last used: {formatLastLogin(passkey.lastUsedAt)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={`Remove ${passkey.name}`}
                  onClick={async () => {
                    const ok = await confirm({
                      title: "Remove passkey?",
                      description: `Remove “${passkey.name}”? You will no longer be able to sign in with it.`,
                      confirmLabel: "Remove",
                      destructive: true,
                    })
                    if (!ok) return
                    try {
                      await api(`/auth/passkeys/${passkey.id}`, {
                        method: "DELETE",
                      })
                      await load({ silent: true })
                    } catch (e) {
                      alert(
                        e instanceof ApiError ? e.message : "Failed to remove passkey",
                      )
                    }
                  }}
                >
                  <IconTrash data-icon="inline-start" />
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
      {dialog}
    </Card>
  )
}
