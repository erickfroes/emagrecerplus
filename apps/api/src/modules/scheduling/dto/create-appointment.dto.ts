import { IsDateString, IsOptional, IsString } from "class-validator";

export class CreateAppointmentDto {
  @IsString()
  patientId!: string;

  @IsString()
  appointmentTypeId!: string;

  @IsOptional()
  @IsString()
  professionalId?: string;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}