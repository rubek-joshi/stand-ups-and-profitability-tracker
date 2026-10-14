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
  options?: {
    onAwareness?: (payload: {
      userId: string
      userName: string
      awareness: Record<string, unknown>
    }) => void
    onConnectionChange?: (connected: boolean) => void
  },
): StandupCollabSession {
  const token = getToken()
  const doc = new Y.Doc()
  const peers: CollabPeer[] = []
  let disposed = false

  const socket = io(`${getApiBaseUrl()}/standup-collab`, {
    auth: { token },
    transports: ["websocket"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
  })

  const publishLocalDiff = (serverUpdate: Uint8Array) => {
    // After merging server state, push any local-only updates so peers/DB catch up.
    const diff = Y.encodeStateAsUpdate(
      doc,
      Y.encodeStateVectorFromUpdate(serverUpdate),
    )
    if (diff.byteLength > 2 && socket.connected) {
      socket.emit("yjs:update", { standupId, update: toBase64(diff) })
    }
  }

  const joinRoom = () => {
    if (disposed) return
    socket.emit(
      "standup:join",
      { standupId },
      (res: { state?: string; peers?: CollabPeer[] } | null) => {
        if (disposed || !res) return
        if (res.state) {
          const update = fromBase64(res.state)
          Y.applyUpdate(doc, update, "remote")
          publishLocalDiff(update)
        }
        peers.splice(0, peers.length, ...(res.peers ?? []))
        onPeers([...peers])
        options?.onConnectionChange?.(true)
      },
    )
  }

  socket.on("connect", () => {
    joinRoom()
  })

  socket.on("disconnect", () => {
    options?.onConnectionChange?.(false)
  })

  socket.on("connect_error", () => {
    options?.onConnectionChange?.(false)
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
      options?.onAwareness?.(payload)
    },
  )

  doc.on("update", (update: Uint8Array, origin: unknown) => {
    if (origin === "remote" || disposed) return
    if (!socket.connected) return
    socket.emit("yjs:update", { standupId, update: toBase64(update) })
  })

  return {
    doc,
    socket,
    disconnect: () => {
      disposed = true
      options?.onConnectionChange?.(false)
      socket.removeAllListeners()
      socket.disconnect()
      doc.destroy()
    },
    setAwareness: (awareness) => {
      if (!socket.connected) return
      socket.emit("awareness:update", { standupId, awareness })
    },
  }
}
