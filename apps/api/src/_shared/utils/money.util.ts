/** 1 NPR = 100 paisa. All money is stored as integer paisa (bigint). */

export function nprToPaisa(npr: number | string): bigint {
  const value = typeof npr === "string" ? Number(npr) : npr;
  if (!Number.isFinite(value)) {
    throw new Error("Invalid NPR amount");
  }
  return BigInt(Math.round(value * 100));
}

export function paisaToNpr(paisa: bigint | number | string): number {
  const value = typeof paisa === "bigint" ? paisa : BigInt(paisa);
  return Number(value) / 100;
}

export function paisaToString(paisa: bigint | number | string): string {
  return paisaToNpr(paisa).toFixed(2);
}

export function serializePaisa(paisa: bigint | number | string): string {
  return String(paisa);
}
