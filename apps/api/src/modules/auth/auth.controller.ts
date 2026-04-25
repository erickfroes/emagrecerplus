import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  UnauthorizedException,
} from "@nestjs/common";
import { Public } from "../../common/auth/public.decorator.ts";
import { AuthService } from "./auth.service.ts";

@Public()
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get("me")
  async getMe(
    @Headers("authorization") authorization?: string,
    @Headers("x-current-unit-id") currentUnitId?: string
  ) {
    const token = this.extractBearerToken(authorization);

    if (!token) {
      throw new UnauthorizedException("Token ausente.");
    }

    const session = await this.authService.getSessionFromAccessToken(token);

    const normalizedCurrentUnitId = currentUnitId?.trim();

    if (!normalizedCurrentUnitId) {
      return session;
    }

    if (!session.accessibleUnitIds.includes(normalizedCurrentUnitId)) {
      throw new ForbiddenException("Usuario sem acesso a unidade selecionada.");
    }

    return {
      ...session,
      currentUnitId: normalizedCurrentUnitId,
    };
  }

  private extractBearerToken(authorization?: string) {
    if (!authorization) return null;
    if (!authorization.startsWith("Bearer ")) return null;
    return authorization.slice("Bearer ".length).trim() || null;
  }
}
