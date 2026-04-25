import { Type } from "class-transformer";
import { IsDateString, IsInt, IsOptional, Min } from "class-validator";

export class CreatePatientAppWaterLogDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amountMl!: number;

  @IsOptional()
  @IsDateString()
  loggedAt?: string;
}
