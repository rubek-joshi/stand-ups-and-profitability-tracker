import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@workspace/ui/components/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@workspace/ui/components/input-group"

type NumberFieldProps = {
  id: string
  label: string
  hint?: string
  suffix?: string
  value: number
  step?: number
  min?: number
  max?: number
  onChange: (value: number) => void
}

export function NumberField({
  id,
  label,
  hint,
  suffix,
  value,
  step = 1,
  min = 0,
  max,
  onChange,
}: NumberFieldProps) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <InputGroup>
        <InputGroupInput
          id={id}
          type="number"
          step={step}
          min={min}
          max={max}
          value={Number.isFinite(value) ? value : ""}
          onChange={(e) =>
            onChange(e.target.value === "" ? Number.NaN : Number(e.target.value))
          }
        />
        {suffix ? (
          <InputGroupAddon align="inline-end">
            <InputGroupText>{suffix}</InputGroupText>
          </InputGroupAddon>
        ) : null}
      </InputGroup>
      {hint ? <FieldDescription>{hint}</FieldDescription> : null}
    </Field>
  )
}
