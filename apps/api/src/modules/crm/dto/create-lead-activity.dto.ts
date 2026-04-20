import { IsOptional, IsString } from "class-validator";

export class CreateLeadActivityDto {
  @IsString()
  activityType!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  dueAt?: string;
}
