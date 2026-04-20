import { IsISO8601, IsOptional, IsString } from "class-validator";

export class RescheduleAppointmentDto {
  @IsISO8601()
  startsAt!: string;

  @IsISO8601()
  endsAt!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
