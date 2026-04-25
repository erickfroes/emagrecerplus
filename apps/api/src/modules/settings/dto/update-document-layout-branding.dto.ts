import { IsObject } from "class-validator";

export class UpdateDocumentLayoutBrandingDto {
  @IsObject()
  branding!: Record<string, unknown>;
}
