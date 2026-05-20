import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY } from "./roles.decorator.js";
import { ROLE_ORDER, type AuthenticatedUser, type UserRole } from "./roles.js";

@Injectable()
export class RoleGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      user?: AuthenticatedUser;
    }>();
    const user = userFromHeaders(req.headers);
    req.user = user;

    const required =
      this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
        ctx.getHandler(),
        ctx.getClass(),
      ]) ?? [];
    if (required.length === 0) return true;
    if (required.some((role) => ROLE_ORDER[user.role] >= ROLE_ORDER[role])) {
      return true;
    }
    throw new ForbiddenException({
      code: "ROLE_FORBIDDEN",
      required,
      actual: user.role,
    });
  }
}

function userFromHeaders(
  headers: Record<string, string | string[] | undefined>,
): AuthenticatedUser {
  const role = parseRole(first(headers["x-user-role"]));
  return {
    id: first(headers["x-user-id"]) ?? "op-001",
    name: first(headers["x-user-name"]) ?? roleLabel(role),
    role,
  };
}

function parseRole(value: string | undefined): UserRole {
  const normalized = value?.toUpperCase();
  if (normalized === "ADMIN") return "ADMIN";
  if (normalized === "DISPATCHER") return "DISPATCHER";
  return "DRIVER";
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function roleLabel(role: UserRole): string {
  if (role === "ADMIN") return "管理员";
  if (role === "DISPATCHER") return "调度员";
  return "司机";
}
