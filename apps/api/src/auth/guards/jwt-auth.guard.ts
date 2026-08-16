import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { AuthUser } from "../types/auth-user.type";

@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const allowed = (await super.canActivate(context)) as boolean;
    if (!allowed) return false;

    const request = context.switchToHttp().getRequest<{
      user?: AuthUser;
      method: string;
      url: string;
      originalUrl?: string;
    }>();
    const user = request.user;
    if (user?.mustChangePassword) {
      const path = (request.originalUrl ?? request.url).split("?")[0] ?? "";
      const normalized = path.replace(/\/+$/, "");
      const ok =
        (request.method === "GET" && normalized.endsWith("/auth/me")) ||
        (request.method === "POST" &&
          normalized.endsWith("/auth/change-password"));
      if (!ok) {
        throw new ForbiddenException(
          "Password change required before continuing",
        );
      }
    }
    return true;
  }
}
