/** Allow Express/Nest JSON responses to serialize Prisma bigint money fields. */
export function enableBigIntJson(): void {
  if (!("toJSON" in BigInt.prototype)) {
    Object.defineProperty(BigInt.prototype, "toJSON", {
      value() {
        return this.toString();
      },
      writable: true,
      configurable: true,
    });
  }
}
