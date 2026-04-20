import { IsOptional, IsString } from "class-validator";

export class SaveAnamnesisDto {
  @IsOptional()
  @IsString()
  chiefComplaint?: string;

  @IsOptional()
  @IsString()
  historyOfPresentIllness?: string;

  @IsOptional()
  @IsString()
  pastMedicalHistory?: string;

  @IsOptional()
  @IsString()
  lifestyleHistory?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}