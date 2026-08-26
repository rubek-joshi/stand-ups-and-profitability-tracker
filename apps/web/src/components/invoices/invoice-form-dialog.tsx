import * as React from "react"
import { IconAlertTriangle } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Textarea } from "@workspace/ui/components/textarea"
import { api, ApiError } from "@/lib/api"
import type { Envelope, PaginatedEnvelope } from "@/lib/api"
import { paisaNumber } from "@/lib/invoice-analytics"
import { formatNpr, nprToPaisa, parseNprInput } from "@/lib/money"
import { nptTodayIso } from "@/lib/standup-age"
import type { Invoice, Project } from "@/lib/types"

type ProjectOption = Pick<
  Project,
  "id" | "name" | "isVatApplicable" | "vatRateApplied" | "budgetPaisa"
> & {
  client?: { id: string; name: string }
  profitability?: Project["profitability"]
}

export function InvoiceFormDialog({
  open,
  onOpenChange,
  project: lockedProject,
  budgetPaisa,
  invoicedAmountPaisa = 0,
  presetProjectId,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  project?: Pick<Project, "id" | "name" | "isVatApplicable" | "vatRateApplied">
  budgetPaisa?: string | number
  invoicedAmountPaisa?: number
  presetProjectId?: string
  onCreated: (invoice: Invoice) => void
}) {
  const pickProject = !lockedProject
  const [projects, setProjects] = React.useState<ProjectOption[]>([])
  const [projectId, setProjectId] = React.useState(presetProjectId ?? "")
  const [resolved, setResolved] = React.useState<{
    project: ProjectOption
    budgetPaisa: string | number
    invoicedAmountPaisa: number
  } | null>(null)
  const [invoiceNumber, setInvoiceNumber] = React.useState("")
  const [invoiceDate, setInvoiceDate] = React.useState(nptTodayIso)
  const [amount, setAmount] = React.useState("")
  const [notes, setNotes] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    setInvoiceDate(nptTodayIso())
    setAmount("")
    setNotes("")
    setError(null)
    setProjectId(lockedProject?.id ?? presetProjectId ?? "")
    setResolved(null)
    void api<Envelope<{ nextNumber: string }>>("/invoices/next-number")
      .then((res) => setInvoiceNumber(res.data.nextNumber))
      .catch(() => setInvoiceNumber(""))
  }, [open, lockedProject?.id, presetProjectId])

  React.useEffect(() => {
    if (!open || !pickProject) return
    void (async () => {
      try {
        const res = await api<PaginatedEnvelope<ProjectOption[]>>("/projects")
        setProjects([...res.data].sort((a, b) => a.name.localeCompare(b.name)))
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : "Failed to load projects",
        )
      }
    })()
  }, [open, pickProject])

  React.useEffect(() => {
    if (!open) return
    if (lockedProject) {
      setResolved({
        project: {
          ...lockedProject,
          budgetPaisa: String(budgetPaisa ?? "0"),
        },
        budgetPaisa: budgetPaisa ?? "0",
        invoicedAmountPaisa,
      })
      return
    }
    if (!projectId) {
      setResolved(null)
      return
    }
    void (async () => {
      try {
        const [projectRes, invoicesRes] = await Promise.all([
          api<Envelope<ProjectOption>>(`/projects/${projectId}`),
          api<PaginatedEnvelope<Invoice[]>>(
            `/invoices?projectId=${encodeURIComponent(projectId)}`,
          ),
        ])
        const project = projectRes.data
        setResolved({
          project,
          budgetPaisa: project.profitability?.revenuePaisa ?? project.budgetPaisa,
          invoicedAmountPaisa: invoicesRes.data.reduce(
            (sum, invoice) => sum + paisaNumber(invoice.amountPaisa),
            0,
          ),
        })
      } catch (err) {
        setResolved(null)
        setError(
          err instanceof ApiError ? err.message : "Failed to load project",
        )
      }
    })()
  }, [open, lockedProject?.id, projectId, budgetPaisa, invoicedAmountPaisa, lockedProject])

  const project = resolved?.project
  const amountNpr = (() => {
    try {
      return amount.trim() ? parseNprInput(amount) : 0
    } catch {
      return 0
    }
  })()
  const vatRate = project?.isVatApplicable ? (project.vatRateApplied ?? 13) : 0
  const amountPaisa = nprToPaisa(amountNpr)
  const vatPaisa = project?.isVatApplicable
    ? Math.round((amountPaisa * vatRate) / 100)
    : 0
  const totalPaisa = amountPaisa + vatPaisa
  const budget = paisaNumber(resolved?.budgetPaisa)
  const invoiced = resolved?.invoicedAmountPaisa ?? 0
  const remainingAfter = budget - invoiced - amountPaisa
  const pctOfBudget = budget > 0 ? (amountPaisa / budget) * 100 : 0
  const overBudget = budget > 0 && invoiced + amountPaisa > budget

  const projectItems = React.useMemo(
    () =>
      Object.fromEntries(
        projects.map((p) => [
          p.id,
          p.client?.name ? `${p.name} · ${p.client.name}` : p.name,
        ]),
      ),
    [projects],
  )

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    if (!project) {
      setError("Pick a project first")
      return
    }
    let parsed: number
    try {
      parsed = parseNprInput(amount)
    } catch {
      setError("Enter a valid amount")
      return
    }
    if (parsed <= 0) {
      setError("Amount must be greater than zero")
      return
    }
    setSaving(true)
    try {
      const res = await api<Envelope<Invoice>>("/invoices", {
        method: "POST",
        body: {
          projectId: project.id,
          invoiceNumber: invoiceNumber.trim(),
          invoiceDate,
          amountNpr: parsed,
          notes: notes.trim() || undefined,
        },
      })
      onCreated(res.data)
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create invoice")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New invoice</DialogTitle>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          {pickProject ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="invoice-project">Project</Label>
              <Select
                value={projectId || null}
                onValueChange={(value) => {
                  setProjectId(value ?? "")
                  setError(null)
                }}
                items={projectItems}
              >
                <SelectTrigger id="invoice-project" className="w-full">
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.client?.name ? `${p.name} · ${p.client.name}` : p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="invoice-number">Invoice number</Label>
            <Input
              id="invoice-number"
              required
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="e.g. INV-001"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="invoice-date">Invoice date</Label>
            <Input
              id="invoice-date"
              type="date"
              required
              max={nptTodayIso()}
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="invoice-amount">Amount (NPR, ex-VAT)</Label>
            <Input
              id="invoice-amount"
              inputMode="decimal"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          {project ? (
            <div className="space-y-1 rounded-lg bg-muted p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  VAT{project.isVatApplicable ? ` (${vatRate}%)` : ""}
                </span>
                <span>
                  {project.isVatApplicable ? formatNpr(vatPaisa) : "Not applicable"}
                </span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>Total</span>
                <span>{formatNpr(totalPaisa)}</span>
              </div>
            </div>
          ) : null}
          {project && budget > 0 ? (
            <div className="space-y-1 rounded-lg border p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">% of total budget</span>
                <span className="font-medium">{pctOfBudget.toFixed(1)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Remaining after this</span>
                <span className={remainingAfter < 0 ? "font-medium text-amber-600" : ""}>
                  {formatNpr(remainingAfter)}
                </span>
              </div>
              {overBudget ? (
                <div className="mt-1 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                  <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <span>This invoice exceeds the total budget. You can still add it.</span>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="invoice-notes">Notes</Label>
            <Textarea
              id="invoice-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !project}>
              {saving ? "Creating…" : "Create invoice"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
