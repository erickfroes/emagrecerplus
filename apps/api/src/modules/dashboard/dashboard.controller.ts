import { Controller, Get, Headers } from "@nestjs/common";
import { AppContext } from "../../common/auth/app-context.decorator.ts";
import { RequirePermissions } from "../../common/auth/require-permissions.decorator.ts";
import type { AppRequestContext } from "../../common/auth/app-session.ts";
import { DashboardService } from "./dashboard.service.ts";

@RequirePermissions("dashboard:view")
@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get("summary")
  getSummary(
    @Headers("authorization") authorization?: string,
    @AppContext() context?: AppRequestContext
  ) {
    return this.dashboardService.getSummary(context, authorization);
  }
}
