import { io, type Socket } from "socket.io-client"
import * as Y from "yjs"
import { getApiBaseUrl, getToken } from "@/lib/api"

export type CollabPeer = { userId: string; userName: string }

export type StandupCollabSession = {
  doc: Y.Doc
  socket: Socket
  disconnect: () => void
  setAwareness: (awareness: Record<string, unknown>) => void
}

function toBase64(bytes: Uint8Array): string {
  let binary = ""
  bytes.forEach((b) => {
    binary += String.fromCharCode(b)
  })
  return btoa(binary)
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export function connectStandupCollab(
  standupId: string,
  onPeers: (peers: CollabPeer[]) => void,
  onAwareness?: (payload: {
    userId: string
    userName: string
    awareness: Record<string, unknown>
  }) => void,
): StandupCollabSession {
  const token = getToken()
  const doc = new Y.Doc()
  const peers: CollabPeer[] = []

  const socket = io(`${getApiBaseUrl()}/standup-collab`, {
    auth: { token },
    transports: ["websocket"],
  })

  socket.on("connect", () => {
    socket.emit(
      "standup:join",
      { standupId },
      (res: { state: string; peers: CollabPeer[] }) => {
        if (res?.state) {
          Y.applyUpdate(doc, fromBase64(res.state), "remote")
        }
        peers.splice(0, peers.length, ...(res?.peers ?? []))
        onPeers([...peers])
      },
    )
  })

  socket.on("yjs:update", (payload: { update: string }) => {
    Y.applyUpdate(doc, fromBase64(payload.update), "remote")
  })

  socket.on("presence:join", (peer: CollabPeer) => {
    if (!peers.some((p) => p.userId === peer.userId)) {
      peers.push(peer)
      onPeers([...peers])
    }
  })

  socket.on("presence:leave", (peer: CollabPeer) => {
    const idx = peers.findIndex((p) => p.userId === peer.userId)
    if (idx >= 0) {
      peers.splice(idx, 1)
      onPeers([...peers])
    }
  })

  socket.on(
    "awareness:update",
    (payload: {
      userId: string
      userName: string
      awareness: Record<string, unknown>
    }) => {
      onAwareness?.(payload)
    },
  )

  doc.on("update", (update: Uint8Array, origin: unknown) => {
    if (origin === "remote") return
    socket.emit("yjs:update", { standupId, update: toBase64(update) })
  })

  return {
    doc,
    socket,
    disconnect: () => {
      socket.disconnect()
      doc.destroy()
    },
    setAwareness: (awareness) => {
      socket.emit("awareness:update", { standupId, awareness })
    },
  }
}
