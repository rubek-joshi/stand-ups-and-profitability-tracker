import { SetMetadata } from "@nestjs/common";

export const PERMISSION_KEY = "permission";

export type PermissionMeta = {
  object: string;
  action: string;
};

export function RequirePermission(object: string, action: string) {
  return SetMetadata(PERMISSION_KEY, { object, action } satisfies PermissionMeta);
}
