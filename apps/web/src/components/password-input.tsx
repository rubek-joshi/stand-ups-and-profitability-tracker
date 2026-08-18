import * as React from "react"
import { IconEye, IconEyeOff, IconRefresh } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@workspace/ui/components/input-group"
import { generatePassword } from "@/lib/password"

export function PasswordInput({
  className,
  ...props
}: Omit<React.ComponentProps<typeof InputGroupInput>, "type">) {
  const [visible, setVisible] = React.useState(false)

  return (
    <InputGroup className={className}>
      <InputGroupInput type={visible ? "text" : "password"} {...props} />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          size="icon-xs"
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <IconEyeOff /> : <IconEye />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  )
}

export function GeneratePasswordButton({
  onGenerate,
}: {
  onGenerate: (password: string) => void
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label="Generate password"
      onClick={() => onGenerate(generatePassword())}
    >
      <IconRefresh />
    </Button>
  )
}
