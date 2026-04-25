import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller.ts";
import { AppAuthGuard } from "./app-auth.guard.ts";
import { AuthService } from "./auth.service.ts";

@Module({
  controllers: [AuthController],
  providers: [AuthService, AppAuthGuard],
  exports: [AuthService],
})
export class AuthModule {}
