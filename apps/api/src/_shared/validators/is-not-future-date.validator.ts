import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from "class-validator";

@ValidatorConstraint({ name: "isNotFutureDate", async: false })
export class IsNotFutureDateConstraint
  implements ValidatorConstraintInterface
{
  validate(value: unknown) {
    if (value === null || value === undefined || value === "") {
      return true;
    }
    if (typeof value !== "string") {
      return false;
    }
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
      return false;
    }
    const now = new Date();
    const todayUtc = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    );
    return date.getTime() <= todayUtc;
  }

  defaultMessage() {
    return "Date must not be in the future";
  }
}

/** Validates an optional ISO date string (YYYY-MM-DD) is today or earlier. */
export function IsNotFutureDate(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsNotFutureDateConstraint,
    });
  };
}
