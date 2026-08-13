import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthUser } from "../../auth/types/auth-user.type";
import { CasbinService } from "../casbin.service";
import {
  PERMISSION_KEY,
  PermissionMeta,
} from "../decorators/require-permission.decorator";

@Injectable()
export class PoliciesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly casbinService: CasbinService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.getAllAndOverride<PermissionMeta | undefined>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!permission) {
      return true;
    }
    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException("Missing authenticated user");
    }
    const allowed = await this.casbinService.enforce(
      `user:${user.id}`,
      permission.object,
      permission.action,
    );
    if (!allowed) {
      throw new ForbiddenException("Insufficient permissions");
    }
    return true;
  }
}
