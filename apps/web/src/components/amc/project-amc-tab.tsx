import * as React from "react"
import { IconFileInvoice, IconReceiptOff } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { IconLock, IconShieldCheck } from "@tabler/icons-react"
import { AmcCard } from "@/components/amc/amc-card"
import { AmcTable } from "@/components/amc/amc-table"
import { CreateAmcDialog } from "@/components/amc/create-amc-dialog"
import { DeclineAmcDialog } from "@/components/amc/decline-amc-dialog"
import { EditAmcDialog } from "@/components/amc/edit-amc-dialog"
import { useConfirmDialog } from "@/components/confirm-dialog"
import { InvoiceFormDialog } from "@/components/invoices/invoice-form-dialog"
import { ListViewToggle } from "@/components/list-view-toggle"
import { PaginationBar } from "@/components/pagination-bar"
import { WriteOffDialog } from "@/components/write-offs/write-off-dialog"
import { api, ApiError } from "@/lib/api"
import type { Envelope } from "@/lib/api"
import { clampPage, totalPagesFor, type PageSize } from "@/lib/list-query"
import { getStoredView, setStoredView, type ListView } from "@/lib/view-pref"
import type { AmcRecord, Project, WriteOffRecord } from "@/lib/types"

const AMC_VIEW_KEY = "pt_project_amc_view"

export function ProjectAmcTab({
  project,
  amcs,
  canManage,
  canDeleteAmc,
  page,
  pageSize,
  view,
  onReload,
  onPageChange,
  onPageSizeChange,
  onViewChange,
}: {
  project: Project
  amcs: AmcRecord[]
  canManage: boolean
  canDeleteAmc: boolean
  page: number
  pageSize: PageSize
  view: ListView
  onReload: () => Promise<void> | void
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: PageSize) => void
  onViewChange: (view: ListView) => void
}) {
  const { confirm, dialog } = useConfirmDialog()
  const [amcCreateOpen, setAmcCreateOpen] = React.useState(false)
  const [editAmc, setEditAmc] = React.useState<AmcRecord | null>(null)
  const [declineAmc, setDeclineAmc] = React.useState<AmcRecord | null>(null)
  const [invoiceAmc, setInvoiceAmc] = React.useState<AmcRecord | null>(null)
  const [writeOffAmc, setWriteOffAmc] = React.useState<AmcRecord | null>(null)
  const [amcWriteOffs, setAmcWriteOffs] = React.useState<
    Record<string, WriteOffRecord[]>
  >({})

  React.useLayoutEffect(() => {
    if (view === "table") {
      setStoredView(AMC_VIEW_KEY, "table")
      return
    }
    if (getStoredView(AMC_VIEW_KEY) !== "table") return
    onViewChange("table")
  }, [])

  const setView = (next: ListView) => {
    setStoredView(AMC_VIEW_KEY, next)
    onViewChange(next)
  }

  React.useEffect(() => {
    const paid = amcs.filter((amc) => amc.type === "paid")
    if (paid.length === 0) {
      setAmcWriteOffs({})
      return
    }
    let cancelled = false
    void Promise.all(
      paid.map(async (amc) => {
        const res = await api<Envelope<WriteOffRecord[]>>(
          `/write-offs?amcId=${encodeURIComponent(amc.id)}`,
        )
        return [amc.id, res.data] as const
      }),
    )
      .then((entries) => {
        if (!cancelled) setAmcWriteOffs(Object.fromEntries(entries))
      })
      .catch(() => {
        if (!cancelled) setAmcWriteOffs({})
      })
    return () => {
      cancelled = true
    }
  }, [amcs])

  const enriched = amcs.map((amc) => ({
    ...amc,
    projectName: project.name,
    clientName: project.client?.name,
    clientId: project.clientId,
  }))

  const totalPages = totalPagesFor(enriched.length, pageSize)
  const pageSafe = clampPage(page, totalPages)
  const paged = enriched.slice(
    (pageSafe - 1) * pageSize,
    pageSafe * pageSize,
  )

  const amcAvailable =
    project.status === "closed" || project.status === "under_amc"

  function remainingWritable(amc: AmcRecord) {
    const written = (amcWriteOffs[amc.id] ?? []).reduce(
      (sum, row) => sum + Number(row.amountPaisa),
      0,
    )
    return Math.max(0, Number(amc.amcAmountPaisa ?? 0) - written)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Maintenance contracts
        </h2>
        <div className="flex items-center gap-2">
          {amcAvailable && enriched.length > 0 ? (
            <ListViewToggle view={view} onChange={setView} />
          ) : null}
          {amcAvailable && canManage ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAmcCreateOpen(true)}
            >
              New AMC
            </Button>
          ) : null}
        </div>
      </div>

      {!amcAvailable ? (
        <Empty className="min-h-64 border bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <IconLock />
            </EmptyMedia>
            <EmptyTitle>AMC unavailable</EmptyTitle>
            <EmptyDescription>
              Close the project before setting AMC.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : enriched.length === 0 ? (
        <Empty className="min-h-64 border bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <IconShieldCheck />
            </EmptyMedia>
            <EmptyTitle>No AMC records</EmptyTitle>
            <EmptyDescription>
              No maintenance contracts for this project yet.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : view === "table" ? (
        <AmcTable
          items={paged}
          hideProject
          canDelete={canDeleteAmc}
          onInvoice={
            canManage ? (record) => setInvoiceAmc(record) : undefined
          }
          onWriteOff={
            canManage ? (record) => setWriteOffAmc(record) : undefined
          }
          canWriteOff={(record) => remainingWritable(record) > 0}
          onRenew={async (record) => {
            await api(`/amc/${record.id}/renewal-decision`, {
              method: "POST",
              body: { decision: "renewed" },
            })
            setAmcCreateOpen(true)
            await onReload()
          }}
          onDecline={(record) => setDeclineAmc(record)}
          onEdit={(record) => setEditAmc(record)}
          onDelete={async (record) => {
            const ok = await confirm({
              title: "Delete AMC permanently?",
              description:
                "This cannot be undone. Prefer decline/cancel when the contract simply ended.",
              confirmLabel: "Delete",
              destructive: true,
            })
            if (!ok) return
            try {
              await api(`/amc/${record.id}`, { method: "DELETE" })
              await onReload()
            } catch (e) {
              alert(e instanceof ApiError ? e.message : "Failed to delete AMC")
            }
          }}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {paged.map((amc) => (
            <div key={amc.id} className="space-y-2">
              <AmcCard
                amc={amc}
                onRenew={async (record) => {
                  await api(`/amc/${record.id}/renewal-decision`, {
                    method: "POST",
                    body: { decision: "renewed" },
                  })
                  setAmcCreateOpen(true)
                  await onReload()
                }}
                onDecline={(record) => setDeclineAmc(record)}
                onEdit={(record) => setEditAmc(record)}
                canDelete={canDeleteAmc}
                onDelete={async (record) => {
                  const ok = await confirm({
                    title: "Delete AMC permanently?",
                    description:
                      "This cannot be undone. Prefer decline/cancel when the contract simply ended.",
                    confirmLabel: "Delete",
                    destructive: true,
                  })
                  if (!ok) return
                  try {
                    await api(`/amc/${record.id}`, { method: "DELETE" })
                    await onReload()
                  } catch (e) {
                    alert(
                      e instanceof ApiError
                        ? e.message
                        : "Failed to delete AMC",
                    )
                  }
                }}
              />
              {canManage && amc.type === "paid" && amc.status !== "cancelled" ? (
                <div className="flex flex-wrap gap-2 px-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setInvoiceAmc(amc)}
                  >
                    <IconFileInvoice className="size-3.5" />
                    Invoice
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setWriteOffAmc(amc)}
                    disabled={remainingWritable(amc) <= 0}
                  >
                    <IconReceiptOff className="size-3.5" />
                    Write off
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {enriched.length > 0 ? (
        <PaginationBar
          page={pageSafe}
          totalPages={totalPages}
          pageSize={pageSize}
          total={enriched.length}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      ) : null}

      <CreateAmcDialog
        open={amcCreateOpen}
        onOpenChange={setAmcCreateOpen}
        presetProjectId={project.id}
        lockProject
        onCreated={() => void onReload()}
      />
      <EditAmcDialog
        amc={editAmc}
        open={Boolean(editAmc)}
        onOpenChange={(open) => {
          if (!open) setEditAmc(null)
        }}
        onUpdated={() => void onReload()}
      />
      <DeclineAmcDialog
        amc={declineAmc}
        open={Boolean(declineAmc)}
        onOpenChange={(open) => {
          if (!open) setDeclineAmc(null)
        }}
        onConfirm={async (remark) => {
          if (!declineAmc) return
          await api(`/amc/${declineAmc.id}/renewal-decision`, {
            method: "POST",
            body: {
              decision: "declined",
              ...(remark ? { remark } : {}),
            },
          })
          setDeclineAmc(null)
          await onReload()
        }}
      />
      <InvoiceFormDialog
        open={Boolean(invoiceAmc)}
        onOpenChange={(open) => {
          if (!open) setInvoiceAmc(null)
        }}
        presetAmcId={invoiceAmc?.id}
        onCreated={() => void onReload()}
      />
      <WriteOffDialog
        open={Boolean(writeOffAmc)}
        onOpenChange={(open) => {
          if (!open) setWriteOffAmc(null)
        }}
        amcId={writeOffAmc?.id}
        maxAmountPaisa={
          writeOffAmc ? remainingWritable(writeOffAmc) : undefined
        }
        onCreated={() => void onReload()}
      />
      {dialog}
    </div>
  )
}
