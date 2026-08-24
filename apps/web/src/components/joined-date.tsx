import { formatJoinedDate, formatTenureAgo } from "@/lib/dates"

export function JoinedDate({ value }: { value: string | Date }) {
  return (
    <span className="whitespace-nowrap">
      {formatJoinedDate(value)}{" "}
      <span className="text-muted-foreground">({formatTenureAgo(value)})</span>
    </span>
  )
}
