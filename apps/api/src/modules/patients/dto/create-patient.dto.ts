import { IsDateString, IsEmail, IsOptional, IsString } from "class-validator";

export class CreatePatientDto {
  @IsString()
  fullName!: string;

  @IsOptional()
  @IsString()
  cpf?: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @IsString()
  primaryPhone?: string;

  @IsOptional()
  @IsEmail()
  primaryEmail?: string;

  @IsOptional()
  @IsString()
  goalsSummary?: string;

  @IsOptional()
  @IsString()
  lifestyleSummary?: string;
}