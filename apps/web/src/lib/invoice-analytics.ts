import { nptTodayIso } from "@/lib/standup-age"
import type { Invoice } from "@/lib/types"

export const OVERDUE_AFTER_DAYS = 15
export const STALE_AFTER_DAYS = 30

export function invoiceDateKey(value: string | Date) {
  return String(value).slice(0, 10)
}

export function calendarDaysBetween(from: string, to: string) {
  const start = Date.parse(`${invoiceDateKey(from)}T00:00:00.000Z`)
  const end = Date.parse(`${invoiceDateKey(to)}T00:00:00.000Z`)
  return Math.round((end - start) / 86_400_000)
}

export function daysSinceInvoice(dateStr: string, todayIso = nptTodayIso()) {
  return calendarDaysBetween(dateStr, todayIso)
}

export function isInvoiceOverdue(invoice: Invoice, todayIso = nptTodayIso()) {
  return (
    invoice.status === "pending" &&
    daysSinceInvoice(invoice.invoiceDate, todayIso) > OVERDUE_AFTER_DAYS
  )
}

export function isInvoiceListStale(invoices: Invoice[], todayIso = nptTodayIso()) {
  if (invoices.length === 0) return false
  const last = [...invoices].sort(
    (a, b) =>
      invoiceDateKey(b.invoiceDate).localeCompare(invoiceDateKey(a.invoiceDate)),
  )[0]
  return daysSinceInvoice(last.invoiceDate, todayIso) >= STALE_AFTER_DAYS
}

export function paisaNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return 0
  const n = typeof value === "string" ? Number(value) : value
  return Number.isFinite(n) ? n : 0
}

export function computeInvoiceAnalytics(invoices: Invoice[]) {
  const sorted = [...invoices].sort((a, b) =>
    invoiceDateKey(a.invoiceDate).localeCompare(invoiceDateKey(b.invoiceDate)),
  )

  const totalInvoicedPaisa = sorted.reduce(
    (sum, invoice) => sum + paisaNumber(invoice.totalPaisa),
    0,
  )
  const totalAmountPaisa = sorted.reduce(
    (sum, invoice) => sum + paisaNumber(invoice.amountPaisa),
    0,
  )
  const paid = sorted.filter((invoice) => invoice.status === "paid")
  const totalPaidPaisa = paid.reduce(
    (sum, invoice) => sum + paisaNumber(invoice.totalPaisa),
    0,
  )
  const outstandingPaisa = totalInvoicedPaisa - totalPaidPaisa

  const paymentDurations = paid
    .filter((invoice) => invoice.paymentDate)
    .map((invoice) =>
      calendarDaysBetween(invoice.invoiceDate, invoice.paymentDate!),
    )
  const avgPaymentDays = paymentDurations.length
    ? Math.round(
        paymentDurations.reduce((sum, days) => sum + days, 0) /
          paymentDurations.length,
      )
    : null

  const gaps: number[] = []
  for (let i = 1; i < sorted.length; i++) {
    gaps.push(
      calendarDaysBetween(
        sorted[i - 1].invoiceDate,
        sorted[i].invoiceDate,
      ),
    )
  }
  const avgInvoiceGap = gaps.length
    ? Math.round(gaps.reduce((sum, days) => sum + days, 0) / gaps.length)
    : null

  const lastInvoice = sorted.length ? sorted[sorted.length - 1] : null
  const lastPaid =
    paid.length === 0
      ? undefined
      : [...paid].sort((a, b) =>
          invoiceDateKey(b.paymentDate ?? "").localeCompare(
            invoiceDateKey(a.paymentDate ?? ""),
          ),
        )[0]

  const overdueInvoices = sorted.filter((invoice) => isInvoiceOverdue(invoice))

  return {
    sorted,
    totalInvoicedPaisa,
    totalAmountPaisa,
    totalPaidPaisa,
    outstandingPaisa,
    avgPaymentDays,
    avgInvoiceGap,
    lastInvoice,
    lastPaid,
    overdueInvoices,
  }
}

export function buildMonthlyInvoiceSeries(invoices: Invoice[]) {
  const map = new Map<string, { month: string; invoiced: number; paid: number }>()
  for (const invoice of invoices) {
    const key = invoiceDateKey(invoice.invoiceDate).slice(0, 7)
    const row = map.get(key) ?? { month: key, invoiced: 0, paid: 0 }
    const total = paisaNumber(invoice.totalPaisa)
    row.invoiced += total
    if (invoice.status === "paid") row.paid += total
    map.set(key, row)
  }
  return [...map.keys()]
    .sort()
    .map((key) => {
      const [year, month] = key.split("-")
      const labels = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ]
      const row = map.get(key)!
      return {
        ...row,
        month: `${labels[Number(month) - 1]} ${year}`,
      }
    })
}

export function paymentDurationSeries(invoices: Invoice[]) {
  return invoices
    .filter((invoice) => invoice.status === "paid" && invoice.paymentDate)
    .map((invoice) => ({
      name: invoice.invoiceNumber || invoiceDateKey(invoice.invoiceDate),
      days: calendarDaysBetween(invoice.invoiceDate, invoice.paymentDate!),
    }))
}
