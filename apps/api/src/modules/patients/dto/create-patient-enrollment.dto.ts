import { IsDateString, IsObject, IsOptional, IsString } from "class-validator";

export class CreatePatientEnrollmentDto {
  @IsString()
  programId!: string;

  @IsString()
  packageId!: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  enrollmentStatus?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
