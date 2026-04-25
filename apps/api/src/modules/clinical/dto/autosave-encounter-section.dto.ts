import { IsDateString, IsIn, IsOptional, IsString } from "class-validator";

export class AutosaveEncounterSectionDto {
  @IsString()
  @IsIn(["anamnesis", "soap_draft"])
  section!: "anamnesis" | "soap_draft";

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

  @IsOptional()
  @IsDateString()
  savedAt?: string;
}
