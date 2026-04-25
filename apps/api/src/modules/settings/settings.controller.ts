import { Body, Controller, Delete, Get, Headers, Param, Post, Put } from "@nestjs/common";
import { RequirePermissions } from "../../common/auth/require-permissions.decorator.ts";
import { CreateTeamInvitationDto } from "./dto/create-team-invitation.dto.ts";
import { UpdateDocumentLayoutBrandingDto } from "./dto/update-document-layout-branding.dto.ts";
import { UpdateDocumentTemplateLayoutDto } from "./dto/update-document-template-layout.dto.ts";
import { SettingsService } from "./settings.service.ts";

@RequirePermissions("settings:view")
@Controller("settings")
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get("access")
  getAccessSnapshot(@Headers("authorization") authorization?: string) {
    return this.settingsService.getAccessSnapshot(authorization);
  }

  @RequirePermissions("clinical:view")
  @Get("document-layout")
  getDocumentLayoutStudioSnapshot(@Headers("authorization") authorization?: string) {
    return this.settingsService.getDocumentLayoutStudioSnapshot(authorization);
  }

  @Post("invitations")
  createInvitation(
    @Body() dto: CreateTeamInvitationDto,
    @Headers("authorization") authorization?: string
  ) {
    return this.settingsService.createInvitation(dto, authorization);
  }

  @Delete("invitations/:id")
  revokeInvitation(
    @Param("id") invitationId: string,
    @Headers("authorization") authorization?: string
  ) {
    return this.settingsService.revokeInvitation(invitationId, authorization);
  }

  @RequirePermissions("clinical:write")
  @Put("document-layout/branding")
  updateDocumentLayoutBranding(
    @Body() dto: UpdateDocumentLayoutBrandingDto,
    @Headers("authorization") authorization?: string
  ) {
    return this.settingsService.updateDocumentLayoutBranding(dto, authorization);
  }

  @RequirePermissions("clinical:write")
  @Put("document-layout/templates/:id")
  updateDocumentTemplateLayout(
    @Param("id") templateId: string,
    @Body() dto: UpdateDocumentTemplateLayoutDto,
    @Headers("authorization") authorization?: string
  ) {
    return this.settingsService.updateDocumentTemplateLayout(templateId, dto, authorization);
  }
}
