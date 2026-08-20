import { useNavigate } from "@tanstack/react-router"
import { IconLogout, IconUser } from "@tabler/icons-react"
import { Avatar, AvatarFallback } from "@workspace/ui/components/avatar"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { SidebarTrigger } from "@workspace/ui/components/sidebar"
import { useConfirmDialog } from "@/components/confirm-dialog"
import { useAuth } from "@/lib/auth"

function userInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase()
}

export function AppHeader() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { confirm, dialog } = useConfirmDialog()

  return (
    <>
      <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-3 md:px-4">
        <SidebarTrigger className="md:hidden" />

        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-2 px-1.5 sm:px-2"
                    aria-label="Account menu"
                  />
                }
              >
                <Avatar size="sm">
                  <AvatarFallback>{userInitials(user.name)}</AvatarFallback>
                </Avatar>
                <span className="hidden max-w-40 truncate text-sm font-medium sm:inline">
                  {user.name}
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-56">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col gap-0.5">
                      <span className="truncate text-sm font-medium text-foreground">
                        {user.name}
                      </span>
                      <span className="truncate text-xs">{user.email}</span>
                    </div>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onClick={() => {
                      void navigate({ to: "/profile" })
                    }}
                  >
                    <IconUser />
                    Profile
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={async () => {
                    const ok = await confirm({
                      title: "Log out?",
                      description: "You will need to sign in again to continue.",
                      confirmLabel: "Log out",
                      destructive: true,
                    })
                    if (ok) {
                      logout()
                      void navigate({ to: "/login" })
                    }
                  }}
                >
                  <IconLogout />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </header>
      {dialog}
    </>
  )
}
