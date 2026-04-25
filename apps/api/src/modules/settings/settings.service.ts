import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { createSupabaseRequestClient } from "../../lib/supabase-request.ts";
import { CreateTeamInvitationDto } from "./dto/create-team-invitation.dto.ts";
import { UpdateDocumentLayoutBrandingDto } from "./dto/update-document-layout-branding.dto.ts";
import { UpdateDocumentTemplateLayoutDto } from "./dto/update-document-template-layout.dto.ts";

@Injectable()
export class SettingsService {
  async getAccessSnapshot(authorization?: string) {
    const client = this.createClientFromAuthorization(authorization);
    const { data, error } = await client.rpc("team_access_snapshot");

    if (error) {
      throw new BadRequestException(`Falha ao consultar acesso da equipe: ${error.message}`);
    }

    return data;
  }

  async createInvitation(dto: CreateTeamInvitationDto, authorization?: string) {
    const client = this.createClientFromAuthorization(authorization);
    const { data, error } = await client.rpc("create_team_invitation", {
      p_email: dto.email,
      p_role_code: dto.roleCode,
      p_unit_ids: dto.unitIds ?? null,
      p_expires_in_days: dto.expiresInDays ?? 7,
      p_note: dto.note ?? null,
    });

    if (error) {
      throw new BadRequestException(`Falha ao criar convite: ${error.message}`);
    }

    return data;
  }

  async revokeInvitation(invitationId: string, authorization?: string) {
    const client = this.createClientFromAuthorization(authorization);
    const { data, error } = await client.rpc("revoke_team_invitation", {
      p_invitation_id: invitationId,
    });

    if (error) {
      throw new BadRequestException(`Falha ao revogar convite: ${error.message}`);
    }

    return data;
  }

  async getDocumentLayoutStudioSnapshot(authorization?: string) {
    const client = this.createClientFromAuthorization(authorization);
    const { data, error } = await client.rpc("get_document_layout_studio_snapshot", {
      p_legacy_tenant_id: null,
      p_legacy_unit_id: null,
    });

    if (error) {
      throw new BadRequestException(
        `Falha ao consultar estacao documental: ${error.message}`
      );
    }

    return data;
  }

  async updateDocumentLayoutBranding(
    dto: UpdateDocumentLayoutBrandingDto,
    authorization?: string
  ) {
    const client = this.createClientFromAuthorization(authorization);
    const { data, error } = await client.rpc("update_document_layout_branding", {
      p_legacy_tenant_id: null,
      p_branding: dto.branding,
    });

    if (error) {
      throw new BadRequestException(
        `Falha ao salvar branding documental: ${error.message}`
      );
    }

    return data;
  }

  async updateDocumentTemplateLayout(
    templateId: string,
    dto: UpdateDocumentTemplateLayoutDto,
    authorization?: string
  ) {
    const client = this.createClientFromAuthorization(authorization);
    const { data, error } = await client.rpc("update_document_template_layout", {
      p_legacy_tenant_id: null,
      p_template_id: templateId,
      p_legacy_unit_id: null,
      p_title: dto.title ?? null,
      p_description: dto.description ?? null,
      p_summary: dto.summary ?? null,
      p_content: dto.content ?? null,
      p_render_schema: dto.renderSchema ?? null,
      p_metadata: dto.metadata ?? {},
    });

    if (error) {
      throw new BadRequestException(
        `Falha ao salvar layout do template: ${error.message}`
      );
    }

    return data;
  }

  private createClientFromAuthorization(authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);

    if (!accessToken) {
      throw new UnauthorizedException("Token ausente.");
    }

    return createSupabaseRequestClient(accessToken);
  }

  private extractBearerToken(authorization?: string) {
    if (!authorization) {
      return null;
    }

    if (!authorization.startsWith("Bearer ")) {
      return null;
    }

    return authorization.slice("Bearer ".length).trim() || null;
  }
}
