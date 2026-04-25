import { Transform, Type } from "class-transformer";
import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, Min } from "class-validator";

export class CreatePatientAppWorkoutLogDto {
  @IsString()
  workoutType!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @IsOptional()
  @IsString()
  intensity?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === "") {
      return undefined;
    }

    if (typeof value === "boolean") {
      return value;
    }

    return String(value).toLowerCase() === "true";
  })
  @IsBoolean()
  completed?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsDateString()
  loggedAt?: string;
}
