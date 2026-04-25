import { IsDateString, IsOptional, IsString } from "class-validator";

export class ScheduleReturnDto {
  @IsDateString()
  startsAt!: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsString()
  appointmentTypeId?: string;

  @IsOptional()
  @IsString()
  professionalId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
