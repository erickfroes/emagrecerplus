import { Module } from "@nestjs/common";
import { DashboardController } from "./dashboard.controller.ts";
import { DashboardService } from "./dashboard.service.ts";

@Module({
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
