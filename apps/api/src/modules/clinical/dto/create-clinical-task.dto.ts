import { IsDateString, IsOptional, IsString } from "class-validator";

export class CreateClinicalTaskDto {
  @IsString()
  patientId!: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  encounterId?: string;

  @IsOptional()
  @IsString()
  assignedToUserId?: string;

  @IsOptional()
  @IsString()
  taskType?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  priority?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;
}
