import { serializePaisa } from "./money.util";

type MoneyRecord = Record<string, unknown>;

/** Replace bigint money fields with string paisa values for JSON responses. */
export function serializeMoneyFields<T extends MoneyRecord>(
  entity: T,
  fields: readonly (keyof T & string)[],
): T {
  const result: MoneyRecord = { ...entity };
  for (const field of fields) {
    const value = result[field];
    if (typeof value === "bigint") {
      result[field] = serializePaisa(value);
    }
  }
  return result as T;
}

export function serializeMoneyList<T extends MoneyRecord>(
  entities: T[],
  fields: readonly (keyof T & string)[],
): T[] {
  return entities.map((entity) => serializeMoneyFields(entity, fields));
}
