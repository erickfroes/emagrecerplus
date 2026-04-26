import { Controller, Get, Headers, HttpCode, Param, Post, Query } from "@nestjs/common";
import { RequirePermissions } from "../../common/auth/require-permissions.decorator.ts";
import { NotificationsService } from "./notifications.service.ts";

@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  listMine(
    @Query("includeRead") includeRead?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
    @Headers("authorization") authorization?: string
  ) {
    return this.notificationsService.listMine({ includeRead, limit, offset }, authorization);
  }

  @RequirePermissions("notifications:view")
  @Get("admin")
  listAdmin(
    @Query("status") status?: string,
    @Query("severity") severity?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
    @Headers("authorization") authorization?: string
  ) {
    return this.notificationsService.listAdmin(
      { status, severity, limit, offset },
      authorization
    );
  }

  @HttpCode(200)
  @Post(":id/read")
  markRead(@Param("id") id: string, @Headers("authorization") authorization?: string) {
    return this.notificationsService.markRead(id, authorization);
  }
}
