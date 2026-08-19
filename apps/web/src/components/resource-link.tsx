import { Link } from "@tanstack/react-router"
import { cn } from "@workspace/ui/lib/utils"

type ResourceLinkProps = {
  children: React.ReactNode
  className?: string
}

/** Link a named resource to its detail page. */
export function ProjectLink({
  id,
  children,
  className,
}: ResourceLinkProps & { id: string }) {
  return (
    <Link
      to="/projects/$id"
      params={{ id }}
      className={cn("font-medium hover:underline", className)}
    >
      {children}
    </Link>
  )
}

export function ClientLink({
  id,
  children,
  className,
}: ResourceLinkProps & { id: string }) {
  return (
    <Link
      to="/clients/$id"
      params={{ id }}
      className={cn("font-medium hover:underline", className)}
    >
      {children}
    </Link>
  )
}

export function EmployeeLink({
  id,
  children,
  className,
}: ResourceLinkProps & { id: string }) {
  return (
    <Link
      to="/employees/$id"
      params={{ id }}
      className={cn("font-medium hover:underline", className)}
    >
      {children}
    </Link>
  )
}

export function CoreMemberLink({
  id,
  children,
  className,
}: ResourceLinkProps & { id: string }) {
  return (
    <Link
      to="/core-members/$id"
      params={{ id }}
      className={cn("font-medium hover:underline", className)}
    >
      {children}
    </Link>
  )
}

export function StandupLink({
  id,
  children,
  className,
}: ResourceLinkProps & { id: string }) {
  return (
    <Link
      to="/stand-ups/$id"
      params={{ id }}
      className={cn("font-medium hover:underline", className)}
    >
      {children}
    </Link>
  )
}

export function UserLink({
  id,
  children,
  className,
}: ResourceLinkProps & { id: string }) {
  return (
    <Link
      to="/users/$id"
      params={{ id }}
      className={cn("font-medium hover:underline", className)}
    >
      {children}
    </Link>
  )
}

/** Resolve audit/API target types to a detail-page link when possible. */
export function EntityLink({
  type,
  id,
  children,
  className,
}: ResourceLinkProps & { type: string; id: string }) {
  switch (type) {
    case "Client":
      return (
        <ClientLink id={id} className={className}>
          {children}
        </ClientLink>
      )
    case "Project":
      return (
        <ProjectLink id={id} className={className}>
          {children}
        </ProjectLink>
      )
    case "Employee":
      return (
        <EmployeeLink id={id} className={className}>
          {children}
        </EmployeeLink>
      )
    case "CoreMember":
      return (
        <CoreMemberLink id={id} className={className}>
          {children}
        </CoreMemberLink>
      )
    case "Standup":
      return (
        <StandupLink id={id} className={className}>
          {children}
        </StandupLink>
      )
    case "User":
      return (
        <UserLink id={id} className={className}>
          {children}
        </UserLink>
      )
    default:
      return <span className={className}>{children}</span>
  }
}
