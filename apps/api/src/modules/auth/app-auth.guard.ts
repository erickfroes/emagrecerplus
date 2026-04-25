import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC_ROUTE_KEY } from "../../common/auth/public.decorator.ts";
import {
  type AppPermission,
  type RequestWithAppSession,
  toAppRequestContext,
} from "../../common/auth/app-session.ts";
import { REQUIRED_PERMISSIONS_KEY } from "../../common/auth/require-permissions.decorator.ts";
import { AuthService } from "./auth.service.ts";

@Injectable()
export class AppAuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuthService) private readonly authService: AuthService
  ) {}

  async canActivate(context: ExecutionContext) {
    const isPublicRoute = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ROUTE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublicRoute) {
      return true;
    }

    if (!this.isRealAuthEnabled()) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithAppSession>();
    const accessToken = this.extractBearerToken(request.headers.authorization);

    if (!accessToken) {
      throw new UnauthorizedException("Token ausente.");
    }

    const session = await this.authService.getSessionFromAccessToken(accessToken);
    const requestedUnitId = this.extractRequestedUnitId(request.headers["x-current-unit-id"]);
    const currentUnitId = requestedUnitId ?? session.currentUnitId;
    const allowPatientWithoutUnits =
      session.user.role === "patient" && session.accessibleUnitIds.length === 0;

    if (!allowPatientWithoutUnits && !session.accessibleUnitIds.includes(currentUnitId)) {
      throw new ForbiddenException("Usuario sem acesso a unidade selecionada.");
    }

    request.appSession = {
      ...session,
      currentUnitId,
    };
    request.appContext = toAppRequestContext(request.appSession);

    const requiredPermissions =
      this.reflector.getAllAndOverride<AppPermission[]>(REQUIRED_PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    if (requiredPermissions.length === 0) {
      return true;
    }

    const hasAllPermissions = requiredPermissions.every((permission) =>
      session.permissions.includes(permission)
    );

    if (!hasAllPermissions) {
      throw new ForbiddenException("Usuario sem permissao para esta operacao.");
    }

    return true;
  }

  private isRealAuthEnabled() {
    return (process.env.API_AUTH_MODE ?? process.env.NEXT_PUBLIC_AUTH_MODE ?? "mock") === "real";
  }

  private extractBearerToken(authorization?: string | string[]) {
    const header = Array.isArray(authorization) ? authorization[0] : authorization;

    if (!header) {
      return null;
    }

    if (!header.startsWith("Bearer ")) {
      return null;
    }

    return header.slice("Bearer ".length).trim() || null;
  }

  private extractRequestedUnitId(value?: string | string[]) {
    const unitId = Array.isArray(value) ? value[0] : value;
    return unitId?.trim() || null;
  }
}
