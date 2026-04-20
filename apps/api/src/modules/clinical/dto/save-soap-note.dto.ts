import { IsOptional, IsString } from "class-validator";

export class SaveSoapNoteDto {
  @IsOptional()
  @IsString()
  noteType?: string;

  @IsOptional()
  @IsString()
  subjective?: string;

  @IsOptional()
  @IsString()
  objective?: string;

  @IsOptional()
  @IsString()
  assessment?: string;

  @IsOptional()
  @IsString()
  plan?: string;
}