import { IsBoolean, IsOptional, IsString } from "class-validator";

export class UpdateLeadActivityDto {
  @IsOptional()
  @IsString()
  activityType?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  dueAt?: string;

  @IsOptional()
  @IsBoolean()
  completed?: boolean;
}
