import { Type } from "class-transformer";
import { IsDateString, IsIn, IsNumber, IsOptional, IsString, Max, Min } from "class-validator";

const moodOptions = ["great", "good", "neutral", "bad", "terrible"] as const;

export class CreatePatientAppDailyCheckinDto {
  @IsOptional()
  @IsDateString()
  checkinDate?: string;

  @IsOptional()
  @IsIn(moodOptions)
  mood?: (typeof moodOptions)[number];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(10)
  energyScore?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  @Max(24)
  sleepHours?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  hungerLevel?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
