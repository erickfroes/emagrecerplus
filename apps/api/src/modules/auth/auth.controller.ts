import { Controller, Get, Headers, UnauthorizedException } from "@nestjs/common";
import { AuthService } from "./auth.service.ts";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get("me")
  async getMe(@Headers("authorization") authorization?: string) {
    const token = this.extractBearerToken(authorization);

    if (!token) {
      throw new UnauthorizedException("Token ausente.");
    }

    return this.authService.getSessionFromAccessToken(token);
  }

  private extractBearerToken(authorization?: string) {
    if (!authorization) return null;
    if (!authorization.startsWith("Bearer ")) return null;
    return authorization.slice("Bearer ".length).trim() || null;
  }
}